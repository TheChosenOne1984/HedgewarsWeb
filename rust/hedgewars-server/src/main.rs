#![forbid(unsafe_code)]
#![allow(unused_imports)]
#![allow(dead_code)]
#![allow(unused_variables)]
#![deny(bare_trait_objects)]

use getopts::Options;
use log::*;
use std::{env, net::SocketAddr, str::FromStr as _};

mod core;
mod handlers;
mod protocol;
mod server;
mod utils;

use crate::server::network::{NetworkLayer, NetworkLayerBuilder};

const PROGRAM_NAME: &'_ str = "Hedgewars Game Server";

#[tokio::main]
async fn main() -> tokio::io::Result<()> {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    info!("Hedgewars game server, protocol {}", utils::SERVER_VERSION);

    let args: Vec<String> = env::args().collect();
    let mut opts = Options::new();

    //todo!("Add options for cert paths");
    opts.optopt("p", "port", "port - defaults to 46631", "PORT");
    #[cfg(feature = "ws-connections")]
    {
        opts.optopt("", "ws-port", "accept WebSocket connections (web client) on this port", "PORT");
        opts.optmulti("", "ws-origin", "allowed Origin of WebSocket clients (repeatable; default: any)", "ORIGIN");
        opts.optmulti("", "trusted-proxy", "trust X-Forwarded-For from this reverse proxy address (repeatable)", "IP");
    }
    opts.optmulti("", "reconnect-limit-exempt", "do not limit reconnects from this address (repeatable; LAN, tests)", "IP");
    opts.optflag("h", "help", "help");
    let matches = match opts.parse(&args[1..]) {
        Ok(m) => m,
        Err(e) => {
            println!("{}\n{}", e, opts.short_usage(""));
            return Ok(());
        }
    };
    if matches.opt_present("h") {
        println!("{}", opts.usage(PROGRAM_NAME));
        return Ok(());
    }

    let port = matches
        .opt_str("p")
        .and_then(|s| u16::from_str(&s).ok())
        .unwrap_or(46631);
    let v6_address: SocketAddr = format!("[::]:{}", port).parse().unwrap();
    let server = match tokio::net::TcpListener::bind(v6_address).await {
        Ok(listener) => listener,
        Err(err) => {
            warn!(
                "Failed to bind {} ({}), falling back to IPv4 0.0.0.0:{}",
                v6_address, err, port
            );
            let v4_address: SocketAddr = format!("0.0.0.0:{}", port).parse().unwrap();
            tokio::net::TcpListener::bind(v4_address).await?
        }
    };

    let mut reconnect_exempt = vec![];
    for ip in matches.opt_strs("reconnect-limit-exempt") {
        match ip.parse() {
            Ok(ip) => reconnect_exempt.push(ip),
            Err(e) => {
                println!("Invalid --reconnect-limit-exempt {}: {}", ip, e);
                return Ok(());
            }
        }
    }
    let builder = NetworkLayerBuilder::default()
        .with_listener(server)
        .with_reconnect_exempt(reconnect_exempt);
    #[cfg(feature = "ws-connections")]
    let builder = match matches.opt_str("ws-port").map(|s| u16::from_str(&s)) {
        None => builder,
        Some(Err(e)) => {
            println!("Invalid --ws-port: {}", e);
            return Ok(());
        }
        Some(Ok(ws_port)) => {
            let mut trusted_proxies = vec![];
            for ip in matches.opt_strs("trusted-proxy") {
                match ip.parse() {
                    Ok(ip) => trusted_proxies.push(ip),
                    Err(e) => {
                        println!("Invalid --trusted-proxy {}: {}", ip, e);
                        return Ok(());
                    }
                }
            }
            let config = server::websocket::WsConfig {
                allowed_origins: matches.opt_strs("ws-origin"),
                trusted_proxies,
            };
            if config.allowed_origins.is_empty() {
                warn!("WebSocket clients are accepted from any origin (see --ws-origin)");
            }
            let ws_address: SocketAddr = format!("[::]:{}", ws_port).parse().unwrap();
            let listener = match tokio::net::TcpListener::bind(ws_address).await {
                Ok(listener) => listener,
                Err(err) => {
                    warn!("Failed to bind {} ({}), falling back to IPv4", ws_address, err);
                    tokio::net::TcpListener::bind(format!("0.0.0.0:{}", ws_port)).await?
                }
            };
            info!("Accepting WebSocket connections on port {}", ws_port);
            builder.with_ws_listener(listener, config)
        }
    };
    let mut hw_network = builder.build();

    server::replaystorage::ReplayStorage::reorganize();

    hw_network.run().await;
    Ok(())
}
