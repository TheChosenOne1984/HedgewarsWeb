//! WebSocket connections (feature `ws-connections`), used by the web client.
//!
//! A WebSocket connection carries exactly the same byte stream as a TCP
//! connection, split into binary (or text) messages of arbitrary size, so the
//! protocol decoder does not care: `WsStream` turns the message stream back
//! into an `AsyncRead`/`AsyncWrite` byte stream.
//!
//! TLS is expected to be terminated by a reverse proxy in front of the server.
//! When the TCP peer is one of the configured trusted proxies, the client's
//! address is taken from the `X-Forwarded-For` header, because bans and flood
//! control work per address.

use futures_util::{Sink, Stream};
use log::*;
use std::{
    io::{Error, ErrorKind},
    net::{IpAddr, SocketAddr},
    pin::Pin,
    task::{Context, Poll},
    time::Duration,
};
use tokio::{
    io::{AsyncRead, AsyncWrite, ReadBuf},
    net::TcpStream,
    time::timeout,
};
use tokio_tungstenite::{
    tungstenite::{
        handshake::server::{ErrorResponse, Request, Response},
        http::StatusCode,
        Message,
    },
    WebSocketStream,
};

/// Time a client gets to complete the WebSocket handshake
pub const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(10);

/// Largest message accepted from a client; protocol messages are small
const MAX_MESSAGE_SIZE: usize = 64 << 10;

#[derive(Clone, Debug, Default)]
pub struct WsConfig {
    /// Allowed values of the Origin header; empty allows any origin
    pub allowed_origins: Vec<String>,
    /// Peers whose X-Forwarded-For header is trusted (the reverse proxy)
    pub trusted_proxies: Vec<IpAddr>,
}

impl WsConfig {
    fn origin_allowed(&self, origin: Option<&str>) -> bool {
        self.allowed_origins.is_empty()
            || origin.map_or(false, |o| self.allowed_origins.iter().any(|a| a == o))
    }

    /// The client's address: the peer itself, or for a trusted proxy the
    /// rightmost X-Forwarded-For entry that is not a trusted proxy.
    pub fn client_ip(&self, peer: IpAddr, forwarded_for: Option<&str>) -> IpAddr {
        // a dual-stack listener sees IPv4 peers as ::ffff:a.b.c.d
        let peer = crate::utils::normalize_ip(peer);
        let trusted = |ip: &IpAddr| {
            self.trusted_proxies
                .iter()
                .any(|p| crate::utils::normalize_ip(*p) == *ip)
        };
        if !trusted(&peer) {
            return peer;
        }
        forwarded_for
            .into_iter()
            .flat_map(|header| header.rsplit(','))
            .filter_map(|entry| entry.trim().parse::<IpAddr>().ok())
            .map(crate::utils::normalize_ip)
            .find(|ip| !trusted(ip))
            .unwrap_or(peer)
    }
}

/// Perform the WebSocket handshake; returns the stream and the client address
pub async fn accept(
    stream: TcpStream,
    peer: SocketAddr,
    config: &WsConfig,
) -> Result<(WsStream, SocketAddr), Error> {
    let mut forwarded_for = None;
    let check = |request: &Request, response: Response| -> Result<Response, ErrorResponse> {
        let origin = request
            .headers()
            .get("origin")
            .and_then(|v| v.to_str().ok());
        if !config.origin_allowed(origin) {
            warn!("WebSocket from {} rejected: origin {:?} not allowed", peer, origin);
            let mut error = ErrorResponse::new(Some("origin not allowed".to_string()));
            *error.status_mut() = StatusCode::FORBIDDEN;
            return Err(error);
        }
        forwarded_for = request
            .headers()
            .get("x-forwarded-for")
            .and_then(|v| v.to_str().ok())
            .map(str::to_string);
        Ok(response)
    };
    let ws_config = tokio_tungstenite::tungstenite::protocol::WebSocketConfig {
        max_message_size: Some(MAX_MESSAGE_SIZE),
        max_frame_size: Some(MAX_MESSAGE_SIZE),
        ..Default::default()
    };
    let ws = match timeout(
        HANDSHAKE_TIMEOUT,
        tokio_tungstenite::accept_hdr_async_with_config(stream, check, Some(ws_config)),
    )
    .await
    {
        Ok(Ok(ws)) => ws,
        Ok(Err(e)) => return Err(Error::new(ErrorKind::InvalidData, e)),
        Err(_) => return Err(Error::new(ErrorKind::TimedOut, "WebSocket handshake timed out")),
    };
    let ip = config.client_ip(peer.ip(), forwarded_for.as_deref());
    Ok((WsStream::new(ws), SocketAddr::new(ip, peer.port())))
}

/// A WebSocket connection as a byte stream
pub struct WsStream {
    ws: WebSocketStream<TcpStream>,
    read_buf: Vec<u8>,
    read_pos: usize,
}

impl WsStream {
    fn new(ws: WebSocketStream<TcpStream>) -> Self {
        Self {
            ws,
            read_buf: Vec::new(),
            read_pos: 0,
        }
    }
}

fn ws_error(e: tokio_tungstenite::tungstenite::Error) -> Error {
    use tokio_tungstenite::tungstenite::Error::*;
    match e {
        Io(e) => e,
        ConnectionClosed | AlreadyClosed => Error::new(ErrorKind::ConnectionReset, e),
        e => Error::new(ErrorKind::InvalidData, e),
    }
}

impl AsyncRead for WsStream {
    fn poll_read(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        let this = Pin::into_inner(self);
        loop {
            if this.read_pos < this.read_buf.len() {
                let n = buf.remaining().min(this.read_buf.len() - this.read_pos);
                buf.put_slice(&this.read_buf[this.read_pos..this.read_pos + n]);
                this.read_pos += n;
                return Poll::Ready(Ok(()));
            }
            match Pin::new(&mut this.ws).poll_next(cx) {
                Poll::Ready(Some(Ok(Message::Binary(data)))) => {
                    this.read_buf = data;
                    this.read_pos = 0;
                }
                Poll::Ready(Some(Ok(Message::Text(text)))) => {
                    this.read_buf = text.into_bytes();
                    this.read_pos = 0;
                }
                // pings are answered by tungstenite itself
                Poll::Ready(Some(Ok(Message::Ping(_) | Message::Pong(_) | Message::Frame(_)))) => {}
                // end of stream: read nothing
                Poll::Ready(Some(Ok(Message::Close(_)))) | Poll::Ready(None) => {
                    return Poll::Ready(Ok(()))
                }
                Poll::Ready(Some(Err(e))) => return Poll::Ready(Err(ws_error(e))),
                Poll::Pending => return Poll::Pending,
            }
        }
    }
}

impl AsyncWrite for WsStream {
    fn poll_write(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<Result<usize, Error>> {
        let ws = &mut Pin::into_inner(self).ws;
        match Pin::new(&mut *ws).poll_ready(cx) {
            Poll::Ready(Ok(())) => {}
            Poll::Ready(Err(e)) => return Poll::Ready(Err(ws_error(e))),
            Poll::Pending => return Poll::Pending,
        }
        match Pin::new(&mut *ws).start_send(Message::Binary(buf.to_vec())) {
            Ok(()) => Poll::Ready(Ok(buf.len())),
            Err(e) => Poll::Ready(Err(ws_error(e))),
        }
    }

    fn poll_flush(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Error>> {
        Pin::new(&mut Pin::into_inner(self).ws)
            .poll_flush(cx)
            .map_err(ws_error)
    }

    fn poll_shutdown(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Error>> {
        Pin::new(&mut Pin::into_inner(self).ws)
            .poll_close(cx)
            .map_err(ws_error)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config(origins: &[&str], proxies: &[&str]) -> WsConfig {
        WsConfig {
            allowed_origins: origins.iter().map(|s| s.to_string()).collect(),
            trusted_proxies: proxies.iter().map(|s| s.parse().unwrap()).collect(),
        }
    }

    #[test]
    fn origin_allowlist() {
        let open = config(&[], &[]);
        assert!(open.origin_allowed(None));
        assert!(open.origin_allowed(Some("https://evil.example")));

        let strict = config(&["https://hw.example"], &[]);
        assert!(strict.origin_allowed(Some("https://hw.example")));
        assert!(!strict.origin_allowed(Some("https://evil.example")));
        assert!(!strict.origin_allowed(None));
    }

    #[test]
    fn client_ip_from_trusted_proxy_only() {
        let c = config(&[], &["10.0.0.2", "10.0.0.3"]);
        let client: IpAddr = "203.0.113.7".parse().unwrap();
        let proxy: IpAddr = "10.0.0.2".parse().unwrap();
        let stranger: IpAddr = "198.51.100.1".parse().unwrap();

        // untrusted peer: header ignored
        assert_eq!(c.client_ip(stranger, Some("203.0.113.7")), stranger);
        // trusted proxy: rightmost untrusted entry wins, spoofed left entries ignored
        assert_eq!(c.client_ip(proxy, Some("1.2.3.4, 203.0.113.7")), client);
        assert_eq!(c.client_ip(proxy, Some("203.0.113.7, 10.0.0.3")), client);
        // the proxy as a dual-stack listener sees it (IPv4-mapped IPv6)
        let mapped: IpAddr = "::ffff:10.0.0.2".parse().unwrap();
        assert_eq!(c.client_ip(mapped, Some("203.0.113.7")), client);
        // trusted proxy without a usable header
        assert_eq!(c.client_ip(proxy, None), proxy);
        assert_eq!(c.client_ip(proxy, Some("garbage")), proxy);
    }
}
