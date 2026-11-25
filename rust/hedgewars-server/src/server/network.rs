use bytes::Bytes;
use log::*;
use slab::Slab;
use std::io::Error;
use std::pin::Pin;
use std::task::{Context, Poll};
use std::{
    iter::Iterator,
    net::{IpAddr, SocketAddr},
    time::Duration,
};
use tokio::{
    io::{AsyncRead, AsyncWrite, AsyncWriteExt, ReadBuf},
    net::{TcpListener, TcpStream},
    sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender},
    time::{timeout, Instant},
};
#[cfg(feature = "tls-connections")]
use tokio_native_tls::{TlsAcceptor, TlsStream};

#[cfg(feature = "ws-connections")]
use super::websocket::{self, WsConfig, WsStream};

use crate::{
    core::types::ClientId,
    handlers,
    handlers::{IoResult, IoTask, ServerState},
    protocol::ProtocolDecoder,
};
use hedgewars_network_protocol::messages::*;

const PING_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug)]
enum ClientUpdateData {
    Message(HwProtocolMessage),
    PingSent,
    PingTimeout,
    Error(String),
}

#[derive(Debug)]
struct ClientUpdate {
    client_id: ClientId,
    conn_id: u64,
    data: ClientUpdateData,
}

struct ClientUpdateSender {
    client_id: ClientId,
    conn_id: u64,
    sender: UnboundedSender<ClientUpdate>,
}

impl ClientUpdateSender {
    fn send(&mut self, data: ClientUpdateData) -> bool {
        self.sender
            .send(ClientUpdate {
                client_id: self.client_id,
                conn_id: self.conn_id,
                data,
            })
            .is_ok()
    }
}

enum ClientStream {
    Tcp(TcpStream),
    #[cfg(feature = "tls-connections")]
    Tls(TlsStream<TcpStream>),
    #[cfg(feature = "ws-connections")]
    Ws(WsStream),
}

impl Unpin for ClientStream {}

impl AsyncRead for ClientStream {
    fn poll_read(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        use ClientStream::*;
        match Pin::into_inner(self) {
            Tcp(stream) => Pin::new(stream).poll_read(cx, buf),
            #[cfg(feature = "tls-connections")]
            Tls(stream) => Pin::new(stream).poll_read(cx, buf),
            #[cfg(feature = "ws-connections")]
            Ws(stream) => Pin::new(stream).poll_read(cx, buf),
        }
    }
}

impl AsyncWrite for ClientStream {
    fn poll_write(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<Result<usize, Error>> {
        use ClientStream::*;
        match Pin::into_inner(self) {
            Tcp(stream) => Pin::new(stream).poll_write(cx, buf),
            #[cfg(feature = "tls-connections")]
            Tls(stream) => Pin::new(stream).poll_write(cx, buf),
            #[cfg(feature = "ws-connections")]
            Ws(stream) => Pin::new(stream).poll_write(cx, buf),
        }
    }

    fn poll_flush(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Error>> {
        use ClientStream::*;
        match Pin::into_inner(self) {
            Tcp(stream) => Pin::new(stream).poll_flush(cx),
            #[cfg(feature = "tls-connections")]
            Tls(stream) => Pin::new(stream).poll_flush(cx),
            #[cfg(feature = "ws-connections")]
            Ws(stream) => Pin::new(stream).poll_flush(cx),
        }
    }

    fn poll_shutdown(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Error>> {
        use ClientStream::*;
        match Pin::into_inner(self) {
            Tcp(stream) => Pin::new(stream).poll_shutdown(cx),
            #[cfg(feature = "tls-connections")]
            Tls(stream) => Pin::new(stream).poll_shutdown(cx),
            #[cfg(feature = "ws-connections")]
            Ws(stream) => Pin::new(stream).poll_shutdown(cx),
        }
    }
}

#[derive(PartialEq, Eq)]
enum WriteResult {
    Ok,
    IoError,
    TimedOut,
}

struct NetworkClient {
    id: ClientId,
    conn_id: u64,
    stream: ClientStream,
    receiver: UnboundedReceiver<Bytes>,
    peer_addr: SocketAddr,
    decoder: ProtocolDecoder,
    ping_timeout: Duration,
}

impl NetworkClient {
    fn new(
        id: ClientId,
        conn_id: u64,
        stream: ClientStream,
        peer_addr: SocketAddr,
        receiver: UnboundedReceiver<Bytes>,
    ) -> Self {
        Self::with_timeout(id, conn_id, stream, peer_addr, receiver, PING_TIMEOUT)
    }

    fn with_timeout(
        id: ClientId,
        conn_id: u64,
        stream: ClientStream,
        peer_addr: SocketAddr,
        receiver: UnboundedReceiver<Bytes>,
        ping_timeout: Duration,
    ) -> Self {
        Self {
            id,
            conn_id,
            stream,
            peer_addr,
            receiver,
            decoder: ProtocolDecoder::new(),
            ping_timeout,
        }
    }

    async fn write<T: AsyncWrite + Unpin>(
        stream: &mut T,
        data: Bytes,
        write_timeout: Duration,
    ) -> WriteResult {
        if data.is_empty() {
            return WriteResult::Ok;
        }
        // flush: TLS and WebSocket streams buffer until flushed
        let write = async {
            stream.write_all(&data).await?;
            stream.flush().await
        };
        match timeout(write_timeout, write).await {
            Ok(Ok(())) => WriteResult::Ok,
            Ok(Err(_)) => WriteResult::IoError,
            Err(_) => WriteResult::TimedOut,
        }
    }

    async fn run(mut self, sender: UnboundedSender<ClientUpdate>) {
        use ClientUpdateData::*;
        let mut sender = ClientUpdateSender {
            client_id: self.id,
            conn_id: self.conn_id,
            sender,
        };
        let ping_timeout = self.ping_timeout;
        let ping_timer = tokio::time::sleep(ping_timeout);
        tokio::pin!(ping_timer);
        let mut ping_sent = false;

        loop {
            tokio::select! {
                client_message = self.decoder.read_from(&mut self.stream) => {
                    match client_message {
                        Ok(message) => {
                            if matches!(message, HwProtocolMessage::Pong) {
                                ping_sent = false;
                                ping_timer.as_mut().reset(Instant::now() + ping_timeout);
                            } else if !ping_sent {
                                ping_timer.as_mut().reset(Instant::now() + ping_timeout);
                            }
                            if !sender.send(Message(message)) {
                                break;
                            }
                        }
                        Err(e) => {
                            while let Ok(message) = self.receiver.try_recv() {
                                if Self::write(&mut self.stream, message, ping_timeout).await
                                    != WriteResult::Ok
                                {
                                    break;
                                }
                            }
                            sender.send(Error(format!("{}", e)));
                            break;
                        }
                    }
                }
                server_message = self.receiver.recv() => {
                    match server_message {
                        Some(message) => {
                            match Self::write(&mut self.stream, message, ping_timeout).await {
                                WriteResult::Ok => (),
                                WriteResult::IoError => {
                                    sender.send(Error("Connection reset by peer".to_string()));
                                    break;
                                }
                                WriteResult::TimedOut => {
                                    sender.send(PingTimeout);
                                    break;
                                }
                            }
                        }
                        None => {
                            let _ = timeout(ping_timeout, self.stream.shutdown()).await;
                            break;
                        }
                    }
                }
                () = &mut ping_timer => {
                    if ping_sent {
                        if sender.send(PingTimeout) {
                            while let Some(message) = self.receiver.recv().await {
                                if Self::write(&mut self.stream, message, ping_timeout).await
                                    != WriteResult::Ok
                                {
                                    break;
                                }
                            }
                            let _ = timeout(ping_timeout, self.stream.shutdown()).await;
                        }
                        break;
                    } else {
                        match Self::write(
                            &mut self.stream,
                            Bytes::from(HwServerMessage::Ping.to_raw_protocol()),
                            ping_timeout,
                        )
                        .await
                        {
                            WriteResult::Ok => {
                                if !sender.send(PingSent) {
                                    break;
                                }
                                ping_sent = true;
                                ping_timer.as_mut().reset(Instant::now() + ping_timeout);
                            }
                            WriteResult::IoError => {
                                sender.send(Error("Connection reset by peer".to_string()));
                                break;
                            }
                            WriteResult::TimedOut => {
                                sender.send(PingTimeout);
                                break;
                            }
                        }
                    }
                }
            }
        }
    }
}

#[cfg(feature = "tls-connections")]
struct TlsListener {
    listener: TcpListener,
    acceptor: TlsAcceptor,
}

pub struct NetworkLayer {
    listener: TcpListener,
    #[cfg(feature = "tls-connections")]
    tls: Option<TlsListener>,
    #[cfg(feature = "ws-connections")]
    ws: Option<(TcpListener, WsConfig)>,
    // connections accepted (and handshaken) elsewhere, e.g. WebSocket
    accepted_tx: UnboundedSender<(ClientStream, SocketAddr)>,
    accepted_rx: UnboundedReceiver<(ClientStream, SocketAddr)>,
    #[cfg(feature = "official-server")]
    db: super::database::Database,
    server_state: ServerState,
    clients: Slab<(u64, UnboundedSender<Bytes>)>,
    next_conn_id: u64,
    update_tx: UnboundedSender<ClientUpdate>,
    update_rx: UnboundedReceiver<ClientUpdate>,
}

impl NetworkLayer {
    pub async fn run(&mut self) {
        async fn accept_plain_branch(
            layer: &mut NetworkLayer,
            value: (TcpStream, SocketAddr),
            update_tx: UnboundedSender<ClientUpdate>,
        ) {
            let (stream, addr) = value;
            if let Some(client) = layer.create_client(ClientStream::Tcp(stream), addr).await {
                tokio::spawn(client.run(update_tx));
            }
        }

        #[cfg(feature = "tls-connections")]
        async fn accept_tls_branch(
            layer: &mut NetworkLayer,
            value: (TcpStream, SocketAddr),
            update_tx: UnboundedSender<ClientUpdate>,
        ) {
            let (stream, addr) = value;
            let Some(ref tls) = layer.tls else {
                return;
            };
            match tls.acceptor.accept(stream).await {
                Ok(stream) => {
                    if let Some(client) = layer.create_client(ClientStream::Tls(stream), addr).await
                    {
                        tokio::spawn(client.run(update_tx));
                    }
                }
                Err(e) => {
                    warn!("Unable to establish TLS connection: {}", e);
                }
            }
        }

        async fn accepted_branch(
            layer: &mut NetworkLayer,
            stream: ClientStream,
            addr: SocketAddr,
            update_tx: UnboundedSender<ClientUpdate>,
        ) {
            if let Some(client) = layer.create_client(stream, addr).await {
                tokio::spawn(client.run(update_tx));
            }
        }

        async fn client_message_branch(
            layer: &mut NetworkLayer,
            client_message: Option<ClientUpdate>,
        ) {
            use ClientUpdateData::*;
            let Some(ClientUpdate {
                client_id,
                conn_id,
                data,
            }) = client_message
            else {
                return;
            };
            if layer.clients.get(client_id).map(|(cid, _)| *cid) != Some(conn_id) {
                return;
            }
            match data {
                Message(message) => {
                    layer.handle_message(client_id, message).await;
                }
                PingSent => {
                    handlers::handle_ping_sent(&mut layer.server_state, client_id);
                }
                PingTimeout => {
                    let mut response = handlers::Response::new(client_id);
                    info!("Client {} ping timeout", client_id);
                    response.remove_client(client_id);
                    handlers::handle_client_timed_out(
                        &mut layer.server_state,
                        client_id,
                        &mut response,
                    );
                    layer.handle_response(response).await;
                }
                Error(e) => {
                    let mut response = handlers::Response::new(client_id);
                    info!("Client {} error: {:?}", client_id, e);
                    response.remove_client(client_id);
                    handlers::handle_client_loss(&mut layer.server_state, client_id, &mut response);
                    layer.handle_response(response).await;
                }
            }
        }

        #[cfg(feature = "ws-connections")]
        if let Some((listener, config)) = self.ws.take() {
            tokio::spawn(run_ws_listener(listener, config, self.accepted_tx.clone()));
        }

        loop {
            #[cfg(not(feature = "tls-connections"))]
            tokio::select! {
                Ok(value) = self.listener.accept() => accept_plain_branch(self, value, self.update_tx.clone()).await,
                Some((stream, addr)) = self.accepted_rx.recv() => accepted_branch(self, stream, addr, self.update_tx.clone()).await,
                client_message = self.update_rx.recv(), if !self.clients.is_empty() => client_message_branch(self, client_message).await
            }

            #[cfg(feature = "tls-connections")]
            if self.tls.is_some() {
                tokio::select! {
                    Ok(value) = self.listener.accept() => accept_plain_branch(self, value, self.update_tx.clone()).await,
                    Ok(value) = self.tls.as_ref().unwrap().listener.accept() => accept_tls_branch(self, value, self.update_tx.clone()).await,
                    Some((stream, addr)) = self.accepted_rx.recv() => accepted_branch(self, stream, addr, self.update_tx.clone()).await,
                    client_message = self.update_rx.recv(), if !self.clients.is_empty() => client_message_branch(self, client_message).await
                }
            } else {
                tokio::select! {
                    Ok(value) = self.listener.accept() => accept_plain_branch(self, value, self.update_tx.clone()).await,
                    Some((stream, addr)) = self.accepted_rx.recv() => accepted_branch(self, stream, addr, self.update_tx.clone()).await,
                    client_message = self.update_rx.recv(), if !self.clients.is_empty() => client_message_branch(self, client_message).await
                }
            }
        }
    }

    async fn create_client(
        &mut self,
        stream: ClientStream,
        addr: SocketAddr,
    ) -> Option<NetworkClient> {
        // Loopback clients become local admins (no accounts without the
        // official server). A WebSocket client's address comes from the
        // reverse proxy; behind a proxy on the same host without
        // --trusted-proxy every web client would be loopback, so web
        // clients never get local admin rights.
        #[cfg(feature = "ws-connections")]
        let may_be_local_admin = !matches!(stream, ClientStream::Ws(_));
        #[cfg(not(feature = "ws-connections"))]
        let may_be_local_admin = true;
        self.next_conn_id += 1;
        let conn_id = self.next_conn_id;
        let entry = self.clients.vacant_entry();
        let client_id = entry.key();
        let (tx, rx) = unbounded_channel();
        entry.insert((conn_id, tx));

        let client = NetworkClient::new(client_id, conn_id, stream, addr, rx);

        info!("client {} ({}) added", client.id, client.peer_addr);

        let mut response = handlers::Response::new(client_id);

        let peer_ip = crate::utils::normalize_ip(client.peer_addr.ip());
        let added = handlers::handle_client_accept(
            &mut self.server_state,
            client_id,
            &mut response,
            peer_ip,
            may_be_local_admin && peer_ip.is_loopback(),
        );

        self.handle_response(response).await;

        if added {
            Some(client)
        } else {
            tokio::spawn(async move {
                let mut client = client;
                while let Some(message) = client.receiver.recv().await {
                    if NetworkClient::write(&mut client.stream, message, PING_TIMEOUT).await
                        != WriteResult::Ok
                    {
                        break;
                    }
                }
                let _ = timeout(PING_TIMEOUT, client.stream.shutdown()).await;
            });
            None
        }
    }

    async fn handle_message(&mut self, client_id: ClientId, message: HwProtocolMessage) {
        debug!("Handling message {:?} for client {}", message, client_id);
        let mut response = handlers::Response::new(client_id);
        handlers::handle(&mut self.server_state, client_id, &mut response, message);
        self.handle_response(response).await;
    }

    async fn handle_response(&mut self, mut response: handlers::Response) {
        while !response.is_empty() {
            debug!("{} pending server messages", response.len());
            let output = response.extract_messages(&self.server_state.server);
            for (clients, message) in output {
                debug!("Message {:?} to {:?}", message, clients);
                Self::send_message(&mut self.clients, message, clients.iter().cloned());
            }

            for client_id in response.extract_removed_clients() {
                if self.clients.contains(client_id) {
                    self.clients.remove(client_id);
                    info!("Client {} removed", client_id);
                }
            }

            let io_tasks: Vec<_> = response.extract_io_tasks().collect();
            let req_client_id = response.client_id();
            #[cfg(feature = "official-server")]
            for task in io_tasks {
                if let Some(io_result) = self.db.execute_task(task).await {
                    handlers::handle_io_result(
                        &mut self.server_state,
                        req_client_id,
                        &mut response,
                        io_result,
                    );
                }
            }
        }

        #[cfg(debug_assertions)]
        {
            for (client_id, _) in &self.clients {
                debug_assert!(
                    self.server_state.has_client(client_id),
                    "NetworkLayer client {} missing from ServerState",
                    client_id
                );
            }
            for client_id in self.server_state.anteroom.iter_client_ids() {
                debug_assert!(
                    self.clients.contains(client_id),
                    "Anteroom client {} missing from NetworkLayer",
                    client_id
                );
            }
            for client_id in self.server_state.server.iter_client_ids() {
                debug_assert!(
                    self.clients.contains(client_id),
                    "Server client {} missing from NetworkLayer",
                    client_id
                );
            }
            self.server_state.assert_invariants();
        }
    }

    fn send_message<I>(
        clients: &mut Slab<(u64, UnboundedSender<Bytes>)>,
        message: HwServerMessage,
        to_clients: I,
    ) where
        I: Iterator<Item = ClientId>,
    {
        let msg_string = message.to_raw_protocol();
        let bytes = Bytes::copy_from_slice(msg_string.as_bytes());
        for client_id in to_clients {
            if let Some((_, client)) = clients.get_mut(client_id) {
                let _ = client.send(bytes.clone());
            }
        }
    }
}

pub struct NetworkLayerBuilder {
    listener: Option<TcpListener>,
    #[cfg(feature = "ws-connections")]
    ws: Option<(TcpListener, WsConfig)>,
    #[cfg(feature = "tls-connections")]
    tls_listener: Option<TcpListener>,
    #[cfg(feature = "tls-connections")]
    tls_acceptor: Option<TlsAcceptor>,
    clients_capacity: usize,
    rooms_capacity: usize,
    reconnect_exempt: Vec<std::net::IpAddr>,
    reconnect_limit: bool,
}

impl Default for NetworkLayerBuilder {
    fn default() -> Self {
        Self {
            clients_capacity: 1024,
            rooms_capacity: 512,
            reconnect_exempt: vec![],
            reconnect_limit: true,
            listener: None,
            #[cfg(feature = "ws-connections")]
            ws: None,
            #[cfg(feature = "tls-connections")]
            tls_listener: None,
            #[cfg(feature = "tls-connections")]
            tls_acceptor: None,
        }
    }
}

impl NetworkLayerBuilder {
    pub fn with_listener(self, listener: TcpListener) -> Self {
        Self {
            listener: Some(listener),
            ..self
        }
    }

    /// Addresses whose reconnects are not limited
    pub fn with_reconnect_exempt(self, reconnect_exempt: Vec<std::net::IpAddr>) -> Self {
        Self {
            reconnect_exempt,
            ..self
        }
    }

    /// Limit reconnects per address (default) or not
    pub fn with_reconnect_limit(self, reconnect_limit: bool) -> Self {
        Self {
            reconnect_limit,
            ..self
        }
    }

    /// Accept WebSocket connections on `listener` (feature `ws-connections`)
    #[cfg(feature = "ws-connections")]
    pub fn with_ws_listener(self, listener: TcpListener, config: WsConfig) -> Self {
        Self {
            ws: Some((listener, config)),
            ..self
        }
    }

    #[cfg(feature = "tls-connections")]
    pub fn with_tls_acceptor(self, listener: TlsAcceptor) -> Self {
        Self {
            tls_acceptor: Option::from(listener),
            ..self
        }
    }

    #[cfg(feature = "tls-connections")]
    pub fn with_tls_listener(self, listener: TlsAcceptor) -> Self {
        Self {
            tls_acceptor: Option::from(listener),
            ..self
        }
    }

    pub fn build(self) -> NetworkLayer {
        let mut server_state = ServerState::new(self.clients_capacity, self.rooms_capacity);
        for ip in self.reconnect_exempt {
            server_state.anteroom.joins_monitor.exempt(ip);
        }
        if !self.reconnect_limit {
            server_state.anteroom.joins_monitor.disable();
        }

        let clients = Slab::with_capacity(self.clients_capacity);
        let (update_tx, update_rx) = unbounded_channel();
        let (accepted_tx, accepted_rx) = unbounded_channel();

        #[cfg(feature = "official-server")]
        let db_url = std::env::var("HEDGEWARS_DB_URL")
            .ok()
            .or_else(|| server_state.config.as_ref().map(|c| c.database_url()))
            .unwrap_or_else(|| "mysql://hedgewars@127.0.0.1/hedgewars".to_string());

        NetworkLayer {
            listener: self.listener.expect("No listener provided"),
            #[cfg(feature = "tls-connections")]
            tls: match (self.tls_listener, self.tls_acceptor) {
                (Some(listener), Some(acceptor)) => Some(TlsListener { listener, acceptor }),
                _ => None,
            },
            #[cfg(feature = "official-server")]
            db: super::database::Database::new(&db_url),
            #[cfg(feature = "ws-connections")]
            ws: self.ws,
            accepted_tx,
            accepted_rx,
            server_state,
            clients,
            next_conn_id: 0,
            update_tx,
            update_rx,
        }
    }
}

/// Accept WebSocket connections; each handshake runs in its own task so that
/// slow clients cannot hold up the server.
#[cfg(feature = "ws-connections")]
async fn run_ws_listener(
    listener: TcpListener,
    config: WsConfig,
    accepted_tx: UnboundedSender<(ClientStream, SocketAddr)>,
) {
    let config = std::sync::Arc::new(config);
    loop {
        match listener.accept().await {
            Ok((stream, peer)) => {
                let config = config.clone();
                let accepted_tx = accepted_tx.clone();
                tokio::spawn(async move {
                    match websocket::accept(stream, peer, &config).await {
                        Ok((ws, addr)) => {
                            let _ = accepted_tx.send((ClientStream::Ws(ws), addr));
                        }
                        Err(e) => debug!("WebSocket handshake with {} failed: {}", peer, e),
                    }
                });
            }
            Err(e) => warn!("Unable to accept WebSocket connection: {}", e),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::AsyncReadExt;

    #[tokio::test]
    async fn ping_timeout_deliver_bye_despite_server_broadcasts() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let connect_fut = TcpStream::connect(addr);
        let accept_fut = listener.accept();
        let (client_res, server_res) = tokio::join!(connect_fut, accept_fut);
        let mut peer_stream = client_res.unwrap();
        let (server_stream, peer_addr) = server_res.unwrap();

        let (tx, rx) = unbounded_channel();
        let (update_tx, mut update_rx) = unbounded_channel();

        let net_client = NetworkClient::with_timeout(
            1,
            1,
            ClientStream::Tcp(server_stream),
            peer_addr,
            rx,
            Duration::from_millis(80),
        );
        let client_task = tokio::spawn(net_client.run(update_tx));

        // Continuously send server messages faster than ping_timeout to verify
        // that server->client traffic does not reset the ping timer.
        let tx_spam = tx.clone();
        let spam_task = tokio::spawn(async move {
            for _ in 0..10 {
                tokio::time::sleep(Duration::from_millis(20)).await;
                let _ = tx_spam.send(Bytes::from("CHAT\n[server]\nhello\n\n"));
            }
        });

        // 1. Expect PingSent after ~80ms
        let first_update = timeout(Duration::from_millis(300), update_rx.recv())
            .await
            .expect("Timed out waiting for PingSent")
            .unwrap();
        assert!(matches!(first_update.data, ClientUpdateData::PingSent));

        // 2. Expect PingTimeout after another ~80ms
        let second_update = timeout(Duration::from_millis(300), update_rx.recv())
            .await
            .expect("Timed out waiting for PingTimeout")
            .unwrap();
        assert!(matches!(second_update.data, ClientUpdateData::PingTimeout));

        // Simulate NetworkLayer::handle_response sending BYE and removing the client (dropping tx)
        spam_task.abort();
        let _ = tx.send(Bytes::from(
            HwServerMessage::Bye("Ping timeout".to_string()).to_raw_protocol(),
        ));
        drop(tx);

        timeout(Duration::from_millis(300), client_task)
            .await
            .expect("Client task did not terminate")
            .unwrap();

        // Read all bytes received by the peer and verify PING and BYE\nPing timeout were delivered
        let mut received = String::new();
        peer_stream.read_to_string(&mut received).await.unwrap();
        assert!(
            received.contains("PING\n\n"),
            "Expected PING in stream, got: {:?}",
            received
        );
        assert!(
            received.ends_with("BYE\nPing timeout\n\n"),
            "Expected stream to end with BYE\\nPing timeout\\n\\n, got: {:?}",
            received
        );
    }

    #[tokio::test]
    async fn handle_client_timed_out_sends_ping_timeout_to_room_and_lobby() {
        let mut state = ServerState::new(16, 16);
        let loopback = IpAddr::V4(std::net::Ipv4Addr::LOCALHOST);
        let mut response = handlers::Response::new(1);
        handlers::handle_client_accept(&mut state, 1, &mut response, loopback, true);
        handlers::handle(
            &mut state,
            1,
            &mut response,
            HwProtocolMessage::Nick("Alice".to_string(), None),
        );
        handlers::handle(&mut state, 1, &mut response, HwProtocolMessage::Proto(60));
        #[cfg(feature = "official-server")]
        handlers::handle_io_result(
            &mut state,
            1,
            &mut response,
            IoResult::AccountRegistered(false),
        );
        handlers::handle(
            &mut state,
            1,
            &mut response,
            HwProtocolMessage::CreateRoom("testroom".to_string(), None),
        );

        let mut response2 = handlers::Response::new(2);
        handlers::handle_client_accept(&mut state, 2, &mut response2, loopback, true);
        handlers::handle(
            &mut state,
            2,
            &mut response2,
            HwProtocolMessage::Nick("Bob".to_string(), None),
        );
        handlers::handle(&mut state, 2, &mut response2, HwProtocolMessage::Proto(60));
        #[cfg(feature = "official-server")]
        handlers::handle_io_result(
            &mut state,
            2,
            &mut response2,
            IoResult::AccountRegistered(false),
        );
        handlers::handle(
            &mut state,
            2,
            &mut response2,
            HwProtocolMessage::JoinRoom("testroom".to_string(), None),
        );

        let mut timeout_resp = handlers::Response::new(2);
        handlers::handle_client_timed_out(&mut state, 2, &mut timeout_resp);
        let messages: Vec<_> = timeout_resp.extract_messages(&state.server).collect();

        assert!(messages.iter().any(|(ids, msg)| {
            ids == &vec![1]
                && matches!(
                    msg,
                    HwServerMessage::RoomLeft(nick, reason)
                        if nick == "Bob" && reason == "Ping timeout"
                )
        }));
        assert!(messages.iter().any(|(ids, msg)| {
            ids == &vec![1]
                && matches!(
                    msg,
                    HwServerMessage::LobbyLeft(nick, reason)
                        if nick == "Bob" && reason == "Ping timeout"
                )
        }));
        assert!(messages.iter().any(|(ids, msg)| {
            ids == &vec![2]
                && matches!(
                    msg,
                    HwServerMessage::Bye(reason) if reason == "Ping timeout"
                )
        }));
    }

    #[cfg(feature = "ws-connections")]
    mod websocket {
        use super::*;
        use futures_util::{SinkExt, StreamExt};
        use tokio::io::AsyncReadExt;
        use tokio_tungstenite::{
            connect_async,
            tungstenite::{client::IntoClientRequest, Message},
        };

        const WAIT: Duration = Duration::from_secs(5);

        async fn start_server(allowed_origins: Vec<String>) -> (SocketAddr, SocketAddr) {
            let tcp = TcpListener::bind("127.0.0.1:0").await.unwrap();
            let ws = TcpListener::bind("127.0.0.1:0").await.unwrap();
            let addrs = (tcp.local_addr().unwrap(), ws.local_addr().unwrap());
            let config = WsConfig {
                allowed_origins,
                trusted_proxies: vec![],
            };
            let mut layer = NetworkLayerBuilder::default()
                .with_listener(tcp)
                .with_ws_listener(ws, config)
                .build();
            tokio::spawn(async move { layer.run().await });
            addrs
        }

        /// read from a WebSocket until the received text contains `needle`
        async fn ws_expect<S>(ws: &mut S, received: &mut String, needle: &str)
        where
            S: futures_util::Stream<
                    Item = Result<Message, tokio_tungstenite::tungstenite::Error>,
                > + Unpin,
        {
            timeout(WAIT, async {
                while !received.contains(needle) {
                    match ws.next().await.expect("connection closed").unwrap() {
                        Message::Binary(data) => received.push_str(&String::from_utf8(data).unwrap()),
                        Message::Text(text) => received.push_str(&text),
                        _ => {}
                    }
                }
            })
            .await
            .unwrap_or_else(|_| panic!("expected {:?}, got {:?}", needle, received));
        }

        async fn tcp_expect(stream: &mut TcpStream, received: &mut String, needle: &str) {
            timeout(WAIT, async {
                let mut buf = [0u8; 4096];
                while !received.contains(needle) {
                    let n = stream.read(&mut buf).await.unwrap();
                    assert!(n > 0, "connection closed");
                    received.push_str(&String::from_utf8_lossy(&buf[..n]));
                }
            })
            .await
            .unwrap_or_else(|_| panic!("expected {:?}, got {:?}", needle, received));
        }

        #[tokio::test]
        async fn ws_client_meets_tcp_client() {
            let (tcp_addr, ws_addr) = start_server(vec![]).await;

            // web client logs in over WebSocket (binary frames)
            let (mut ws, _) = connect_async(format!("ws://{}", ws_addr)).await.unwrap();
            let mut ws_in = String::new();
            ws_expect(&mut ws, &mut ws_in, "CONNECTED\n").await;
            ws.send(Message::Binary(b"NICK\nwebuser\n\nPROTO\n60\n\n".to_vec()))
                .await
                .unwrap();
            ws_expect(&mut ws, &mut ws_in, "LOBBY:JOINED\nwebuser\n").await;

            // desktop client logs in over TCP and sees the web client in the lobby
            let mut tcp = TcpStream::connect(tcp_addr).await.unwrap();
            let mut tcp_in = String::new();
            tcp_expect(&mut tcp, &mut tcp_in, "CONNECTED\n").await;
            tcp.write_all(b"NICK\ndesktopuser\n\nPROTO\n60\n\n").await.unwrap();
            tcp_expect(&mut tcp, &mut tcp_in, "LOBBY:JOINED\n").await;
            assert!(tcp_in.contains("webuser"), "lobby list: {:?}", tcp_in);
            ws_expect(&mut ws, &mut ws_in, "LOBBY:JOINED\ndesktopuser\n").await;

            // both connect from loopback: the desktop client is a local admin,
            // the web client (address from a proxy) never is
            tcp_expect(&mut tcp, &mut tcp_in, "CLIENT_FLAGS\n+a\ndesktopuser\n").await;
            assert!(!tcp_in.contains("+a\nwebuser"), "web client is admin: {:?}", tcp_in);
            assert!(!ws_in.contains("+a\nwebuser"), "web client is admin: {:?}", ws_in);

            // the web client creates a room (text frames work too), the desktop client joins
            ws.send(Message::Text("CREATE_ROOM\nwebroom\n\n".to_string()))
                .await
                .unwrap();
            tcp_expect(&mut tcp, &mut tcp_in, "ROOM\nADD\n").await;
            tcp.write_all(b"JOIN_ROOM\nwebroom\n\n").await.unwrap();
            tcp_expect(&mut tcp, &mut tcp_in, "JOINED\n").await;
            ws_expect(&mut ws, &mut ws_in, "JOINED\ndesktopuser\n").await;

            // chat in the room in both directions
            tcp.write_all(b"CHAT\nhello from desktop\n\n").await.unwrap();
            ws_expect(&mut ws, &mut ws_in, "CHAT\ndesktopuser\nhello from desktop\n\n").await;
            ws.send(Message::Binary(b"CHAT\nhello from the web\n\n".to_vec()))
                .await
                .unwrap();
            tcp_expect(&mut tcp, &mut tcp_in, "CHAT\nwebuser\nhello from the web\n\n").await;
        }

        #[tokio::test]
        async fn ws_origin_allowlist() {
            let (_, ws_addr) = start_server(vec!["https://hw.example".to_string()]).await;

            let mut request = format!("ws://{}", ws_addr).into_client_request().unwrap();
            request
                .headers_mut()
                .insert("Origin", "https://evil.example".parse().unwrap());
            assert!(connect_async(request).await.is_err(), "foreign origin accepted");

            let mut request = format!("ws://{}", ws_addr).into_client_request().unwrap();
            request
                .headers_mut()
                .insert("Origin", "https://hw.example".parse().unwrap());
            let (mut ws, _) = connect_async(request).await.expect("allowed origin rejected");
            let mut ws_in = String::new();
            ws_expect(&mut ws, &mut ws_in, "CONNECTED\n").await;
        }
    }
}
