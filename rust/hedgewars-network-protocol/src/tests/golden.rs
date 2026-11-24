//! Golden vectors for other implementations of the protocol (the web client).
//!
//! Writes every client and server message variant with its raw protocol
//! text, as produced by `to_raw_protocol`, to a JSON file:
//!
//!     HW_GOLDEN_OUT=path/to/golden.json \
//!         cargo test -p hedgewars-network-protocol export_golden -- --ignored
//!
//! Each entry is `{"msg": {"type": <variant>, "args": [...]}, "raw": <text>}`;
//! tuple variants list their fields in order, `ChatMsg` as `[nick, msg]`.

use crate::{
    messages::{HwProtocolMessage as C, HwServerMessage as S},
    parser::server_message,
    types::{GameCfg, HedgehogInfo, ServerVar, TeamInfo, VoteType},
};

enum J {
    Null,
    Bool(bool),
    Num(i64),
    Str(String),
    Arr(Vec<J>),
    Obj(Vec<(&'static str, J)>),
}

impl J {
    fn s(s: &str) -> J {
        J::Str(s.to_string())
    }

    fn strs(v: &[String]) -> J {
        J::Arr(v.iter().map(|s| J::s(s)).collect())
    }

    fn opt(s: &Option<String>) -> J {
        s.as_ref().map_or(J::Null, |s| J::s(s))
    }

    fn render(&self, out: &mut String) {
        match self {
            J::Null => out.push_str("null"),
            J::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
            J::Num(n) => out.push_str(&n.to_string()),
            J::Str(s) => {
                out.push('"');
                for c in s.chars() {
                    match c {
                        '"' => out.push_str("\\\""),
                        '\\' => out.push_str("\\\\"),
                        '\n' => out.push_str("\\n"),
                        c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
                        c => out.push(c),
                    }
                }
                out.push('"');
            }
            J::Arr(items) => {
                out.push('[');
                for (i, item) in items.iter().enumerate() {
                    if i > 0 {
                        out.push(',');
                    }
                    item.render(out);
                }
                out.push(']');
            }
            J::Obj(fields) => {
                out.push('{');
                for (i, (k, v)) in fields.iter().enumerate() {
                    if i > 0 {
                        out.push(',');
                    }
                    J::s(k).render(out);
                    out.push(':');
                    v.render(out);
                }
                out.push('}');
            }
        }
    }
}

fn msg(ty: &str, args: Vec<J>) -> J {
    J::Obj(vec![("type", J::s(ty)), ("args", J::Arr(args))])
}

fn cfg_json(cfg: &GameCfg) -> J {
    use GameCfg::*;
    match cfg {
        FeatureSize(n) => msg("FeatureSize", vec![J::Num(*n as i64)]),
        MapType(s) => msg("MapType", vec![J::s(s)]),
        MapGenerator(n) => msg("MapGenerator", vec![J::Num(*n as i64)]),
        MazeSize(n) => msg("MazeSize", vec![J::Num(*n as i64)]),
        Seed(s) => msg("Seed", vec![J::s(s)]),
        Template(n) => msg("Template", vec![J::Num(*n as i64)]),
        Ammo(n, s) => msg("Ammo", vec![J::s(n), J::opt(s)]),
        Scheme(n, s) => msg("Scheme", vec![J::s(n), J::strs(s)]),
        Script(s) => msg("Script", vec![J::s(s)]),
        Theme(s) => msg("Theme", vec![J::s(s)]),
        DrawnMap(s) => msg("DrawnMap", vec![J::s(s)]),
    }
}

fn team_json(t: &TeamInfo) -> J {
    J::Obj(vec![
        ("owner", J::s(&t.owner)),
        ("name", J::s(&t.name)),
        ("color", J::Num(t.color as i64)),
        ("grave", J::s(&t.grave)),
        ("fort", J::s(&t.fort)),
        ("voicePack", J::s(&t.voice_pack)),
        ("flag", J::s(&t.flag)),
        ("difficulty", J::Num(t.difficulty as i64)),
        (
            "hedgehogs",
            J::Arr(
                t.hedgehogs
                    .iter()
                    .map(|h| J::Obj(vec![("name", J::s(&h.name)), ("hat", J::s(&h.hat))]))
                    .collect(),
            ),
        ),
    ])
}

fn client_json(m: &C) -> J {
    use C::*;
    let n = |v: u32| J::Num(v as i64);
    match m {
        Ping => msg("Ping", vec![]),
        Pong => msg("Pong", vec![]),
        Quit(s) => msg("Quit", vec![J::opt(s)]),
        Global(s) => msg("Global", vec![J::s(s)]),
        Watch(id) => msg("Watch", vec![n(*id)]),
        ToggleServerRegisteredOnly => msg("ToggleServerRegisteredOnly", vec![]),
        SuperPower => msg("SuperPower", vec![]),
        Info(s) => msg("Info", vec![J::s(s)]),
        Help => msg("Help", vec![]),
        Nick(s, t) => msg("Nick", vec![J::s(s), J::opt(t)]),
        Proto(v) => msg("Proto", vec![n(*v as u32)]),
        Password(p, s) => msg("Password", vec![J::s(p), J::s(s)]),
        LegacyPassword(p) => msg("LegacyPassword", vec![J::s(p)]),
        Checker(v, a, b) => msg("Checker", vec![n(*v as u32), J::s(a), J::s(b)]),
        List => msg("List", vec![]),
        Chat(s) => msg("Chat", vec![J::s(s)]),
        CreateRoom(s, p) => msg("CreateRoom", vec![J::s(s), J::opt(p)]),
        JoinRoom(s, p) => msg("JoinRoom", vec![J::s(s), J::opt(p)]),
        Follow(s) => msg("Follow", vec![J::s(s)]),
        Rnd(v) => msg("Rnd", vec![J::strs(v)]),
        Kick(s) => msg("Kick", vec![J::s(s)]),
        Ban(a, b, t) => msg("Ban", vec![J::s(a), J::s(b), n(*t)]),
        BanIp(a, b, t) => msg("BanIp", vec![J::s(a), J::s(b), n(*t)]),
        BanNick(a, b, t) => msg("BanNick", vec![J::s(a), J::s(b), n(*t)]),
        RoomBan(s) => msg("RoomBan", vec![J::s(s)]),
        BanList => msg("BanList", vec![]),
        Unban(s) => msg("Unban", vec![J::s(s)]),
        SetServerVar(v) => msg(
            "SetServerVar",
            vec![match v {
                ServerVar::MOTDNew(s) => msg("MOTDNew", vec![J::s(s)]),
                ServerVar::MOTDOld(s) => msg("MOTDOld", vec![J::s(s)]),
                ServerVar::LatestProto(p) => msg("LatestProto", vec![n(*p as u32)]),
            }],
        ),
        GetServerVar => msg("GetServerVar", vec![]),
        ClearAccountsCache => msg("ClearAccountsCache", vec![]),
        RestartServer => msg("RestartServer", vec![]),
        RestartServerConfirm => msg("RestartServerConfirm", vec![]),
        Stats => msg("Stats", vec![]),
        Part(s) => msg("Part", vec![J::opt(s)]),
        Cfg(c) => msg("Cfg", vec![cfg_json(c)]),
        AddTeam(t) => msg("AddTeam", vec![team_json(t)]),
        RemoveTeam(s) => msg("RemoveTeam", vec![J::s(s)]),
        SetHedgehogsNumber(s, v) => msg("SetHedgehogsNumber", vec![J::s(s), n(*v as u32)]),
        SetTeamColor(s, v) => msg("SetTeamColor", vec![J::s(s), n(*v as u32)]),
        ToggleReady => msg("ToggleReady", vec![]),
        StartGame => msg("StartGame", vec![]),
        EngineMessage(s) => msg("EngineMessage", vec![J::s(s)]),
        RoundFinished => msg("RoundFinished", vec![]),
        ToggleRestrictJoin => msg("ToggleRestrictJoin", vec![]),
        ToggleRestrictTeams => msg("ToggleRestrictTeams", vec![]),
        ToggleRegisteredOnly => msg("ToggleRegisteredOnly", vec![]),
        RoomName(s) => msg("RoomName", vec![J::s(s)]),
        Delegate(s) => msg("Delegate", vec![J::s(s)]),
        TeamChat(s) => msg("TeamChat", vec![J::s(s)]),
        MaxTeams(v) => msg("MaxTeams", vec![n(*v as u32)]),
        Fix => msg("Fix", vec![]),
        Unfix => msg("Unfix", vec![]),
        Greeting(s) => msg("Greeting", vec![J::opt(s)]),
        CallVote(v) => msg(
            "CallVote",
            vec![match v {
                None => J::Null,
                Some(VoteType::Kick(s)) => msg("Kick", vec![J::s(s)]),
                Some(VoteType::Map(s)) => msg("Map", vec![J::opt(s)]),
                Some(VoteType::Pause) => msg("Pause", vec![]),
                Some(VoteType::NewSeed) => msg("NewSeed", vec![]),
                Some(VoteType::HedgehogsPerTeam(c)) => msg("HedgehogsPerTeam", vec![n(*c as u32)]),
            }],
        ),
        Vote(b) => msg("Vote", vec![J::Bool(*b)]),
        ForceVote(b) => msg("ForceVote", vec![J::Bool(*b)]),
        Save(a, b) => msg("Save", vec![J::s(a), J::s(b)]),
        Delete(s) => msg("Delete", vec![J::s(s)]),
        SaveRoom(s) => msg("SaveRoom", vec![J::s(s)]),
        LoadRoom(s) => msg("LoadRoom", vec![J::s(s)]),
        CheckerReady => msg("CheckerReady", vec![]),
        CheckedOk(v) => msg("CheckedOk", vec![J::strs(v)]),
        CheckedFail(s) => msg("CheckedFail", vec![J::s(s)]),
        Malformed(v) => msg("Malformed", vec![J::strs(v)]),
    }
}

fn server_json(m: &S) -> J {
    use S::*;
    let n = |v: u32| J::Num(v as i64);
    match m {
        Connected(s, v) => msg("Connected", vec![J::s(s), n(*v)]),
        Redirect(p) => msg("Redirect", vec![n(*p as u32)]),
        Ping => msg("Ping", vec![]),
        Pong => msg("Pong", vec![]),
        Bye(s) => msg("Bye", vec![J::s(s)]),
        Nick(s) => msg("Nick", vec![J::s(s)]),
        Token(s) => msg("Token", vec![J::s(s)]),
        Proto(v) => msg("Proto", vec![n(*v as u32)]),
        AskPassword(s) => msg("AskPassword", vec![J::s(s)]),
        ServerAuth(s) => msg("ServerAuth", vec![J::s(s)]),
        AdminAccess => msg("AdminAccess", vec![]),
        LogonPassed => msg("LogonPassed", vec![]),
        LobbyLeft(a, b) => msg("LobbyLeft", vec![J::s(a), J::s(b)]),
        LobbyJoined(v) => msg("LobbyJoined", vec![J::strs(v)]),
        ChatMsg { nick, msg: text } => msg("ChatMsg", vec![J::s(nick), J::s(text)]),
        ClientFlags(f, v) => msg("ClientFlags", vec![J::s(f), J::strs(v)]),
        Rooms(v) => msg("Rooms", vec![J::strs(v)]),
        RoomAdd(v) => msg("RoomAdd", vec![J::strs(v)]),
        RoomJoined(v) => msg("RoomJoined", vec![J::strs(v)]),
        RoomLeft(a, b) => msg("RoomLeft", vec![J::s(a), J::s(b)]),
        RoomRemove(s) => msg("RoomRemove", vec![J::s(s)]),
        RoomAbandoned(s) => msg("RoomAbandoned", vec![J::s(s)]),
        RoomUpdated(s, v) => msg("RoomUpdated", vec![J::s(s), J::strs(v)]),
        RoomControlAccess(b) => msg("RoomControlAccess", vec![J::Bool(*b)]),
        Joining(s) => msg("Joining", vec![J::s(s)]),
        TeamAdd(v) => msg("TeamAdd", vec![J::strs(v)]),
        TeamRemove(s) => msg("TeamRemove", vec![J::s(s)]),
        TeamAccepted(s) => msg("TeamAccepted", vec![J::s(s)]),
        TeamColor(s, c) => msg("TeamColor", vec![J::s(s), n(*c as u32)]),
        HedgehogsNumber(s, c) => msg("HedgehogsNumber", vec![J::s(s), n(*c as u32)]),
        ConfigEntry(s, v) => msg("ConfigEntry", vec![J::s(s), J::strs(v)]),
        Kicked => msg("Kicked", vec![]),
        RunGame => msg("RunGame", vec![]),
        ForwardEngineMessage(v) => msg("ForwardEngineMessage", vec![J::strs(v)]),
        RoundFinished => msg("RoundFinished", vec![]),
        ReplayStart => msg("ReplayStart", vec![]),
        Info(v) => msg("Info", vec![J::strs(v)]),
        ServerMessage(s) => msg("ServerMessage", vec![J::s(s)]),
        ServerVars(v) => msg("ServerVars", vec![J::strs(v)]),
        BanList(v) => msg("BanList", vec![J::strs(v)]),
        Notice(s) => msg("Notice", vec![J::s(s)]),
        Warning(s) => msg("Warning", vec![J::s(s)]),
        Error(s) => msg("Error", vec![J::s(s)]),
        Replay(v) => msg("Replay", vec![J::strs(v)]),
        LegacyReady(b, v) => msg("LegacyReady", vec![J::Bool(*b), J::strs(v)]),
    }
}

fn strs(v: &[&str]) -> Vec<String> {
    v.iter().map(|s| s.to_string()).collect()
}

fn team() -> TeamInfo {
    let mut t = TeamInfo {
        owner: "alice".to_string(),
        name: "Team Ü".to_string(),
        color: 3,
        grave: "Statue".to_string(),
        fort: "Plane".to_string(),
        voice_pack: "Default_qau".to_string(),
        flag: "hedgewars".to_string(),
        difficulty: 2,
        hedgehogs_number: 4,
        ..Default::default()
    };
    for (i, h) in t.hedgehogs.iter_mut().enumerate() {
        *h = HedgehogInfo {
            name: format!("hog {}", i + 1),
            hat: if i % 2 == 0 { "NoHat".to_string() } else { "Crown".to_string() },
        };
    }
    t
}

fn client_messages() -> Vec<C> {
    use C::*;
    let s = |x: &str| x.to_string();
    vec![
        Ping, Pong, Quit(None), Quit(Some(s("bye now"))), Global(s("hello all")), Watch(12345),
        ToggleServerRegisteredOnly, SuperPower, Info(s("bob")), Help,
        Nick(s("it's me"), None), Nick(s("me"), Some(s("tok123"))), Proto(60),
        Password(s("hash"), s("salt")), LegacyPassword(s("pw")), Checker(60, s("checker"), s("pw")),
        List, Chat(s("hello, world")), Chat(s("ünïcödé 🦔")), CreateRoom(s("my room"), None),
        CreateRoom(s("secret"), Some(s("pass"))), JoinRoom(s("my room"), None),
        JoinRoom(s("secret"), Some(s("pass"))), Follow(s("bob")), Rnd(vec![]),
        Rnd(strs(&["a", "b", "c"])), Kick(s("bob")), Ban(s("bob"), s("spam"), 60),
        BanIp(s("10.0.0.1"), s("spam"), 3600), BanNick(s("bob"), s("spam"), 0),
        RoomBan(s("bob")), BanList, Unban(s("bob")),
        SetServerVar(ServerVar::MOTDNew(s("welcome"))), SetServerVar(ServerVar::MOTDOld(s("old"))),
        SetServerVar(ServerVar::LatestProto(60)), GetServerVar, ClearAccountsCache, RestartServer,
        RestartServerConfirm, Stats, Part(None), Part(Some(s("later"))),
        Cfg(GameCfg::FeatureSize(12)), Cfg(GameCfg::MapType(s("+rnd+"))),
        Cfg(GameCfg::MapGenerator(1)), Cfg(GameCfg::MazeSize(2)),
        Cfg(GameCfg::Seed(s("{abc-123}"))), Cfg(GameCfg::Template(5)),
        Cfg(GameCfg::Ammo(s("Default"), None)), Cfg(GameCfg::Ammo(s("Crazy"), Some(s("9391929422")))),
        Cfg(GameCfg::Scheme(s("Default"), vec![])),
        Cfg(GameCfg::Scheme(s("Pro"), strs(&["false", "true", "100", "45"]))),
        Cfg(GameCfg::Script(s("Normal"))), Cfg(GameCfg::Theme(s("Nature"))),
        Cfg(GameCfg::DrawnMap(s("AAAA"))), AddTeam(Box::new(team())), RemoveTeam(s("Team Ü")),
        SetHedgehogsNumber(s("Team Ü"), 4), SetTeamColor(s("Team Ü"), 7), ToggleReady, StartGame,
        EngineMessage(s("BWJhc2U2NA==")), RoundFinished, ToggleRestrictJoin, ToggleRestrictTeams,
        ToggleRegisteredOnly, RoomName(s("new name")), Delegate(s("bob")), TeamChat(s("psst")),
        MaxTeams(4), Fix, Unfix, Greeting(None), Greeting(Some(s("hi there"))), CallVote(None),
        CallVote(Some(VoteType::Kick(s("bob")))), CallVote(Some(VoteType::Map(None))),
        CallVote(Some(VoteType::Map(Some(s("Bamboo"))))), CallVote(Some(VoteType::Pause)),
        CallVote(Some(VoteType::NewSeed)), CallVote(Some(VoteType::HedgehogsPerTeam(3))),
        Vote(true), Vote(false), ForceVote(true), ForceVote(false), Save(s("cfg"), s("loc")),
        Delete(s("cfg")), SaveRoom(s("file")), LoadRoom(s("file")), CheckerReady,
        CheckedOk(strs(&["a", "b"])), CheckedFail(s("bad")),
    ]
}

fn server_messages() -> Vec<S> {
    use S::*;
    let s = |x: &str| x.to_string();
    vec![
        Connected(s("Hedgewars server https://www.hedgewars.org/"), 60), Redirect(46632), Ping, Pong,
        Bye(s("see you")), Nick(s("bob")), Token(s("tok")), Proto(60), AskPassword(String::new()),
        AskPassword(s("salt")), ServerAuth(s("hash")), AdminAccess, LogonPassed,
        LobbyLeft(s("bob"), s("bye")), LobbyJoined(strs(&["alice", "bob"])), LobbyJoined(vec![]),
        ChatMsg { nick: s("alice"), msg: s("hello 🦔") },
        ChatMsg { nick: s("[server]"), msg: s("restart soon") },
        ClientFlags(s("+hr"), strs(&["alice"])), ClientFlags(s("-i"), strs(&["alice", "bob"])),
        Rooms(strs(&["+gp", "room", "2", "1", "alice", "+rnd+", "Normal", "Default", "Default"])),
        Rooms(vec![]), RoomAdd(strs(&["-", "room", "1", "0", "alice", "+rnd+", "Normal", "Default", "Default"])),
        RoomJoined(strs(&["alice"])), RoomLeft(s("bob"), s("part")), RoomRemove(s("room")),
        RoomAbandoned(s("room")),
        RoomUpdated(s("room"), strs(&["+g", "new room", "2", "1", "alice", "+rnd+", "Normal", "Default", "Default"])),
        RoomControlAccess(true), RoomControlAccess(false), Joining(s("room")),
        TeamAdd(team().to_protocol()), TeamRemove(s("Team Ü")), TeamAccepted(s("Team Ü")),
        TeamColor(s("Team Ü"), 5), HedgehogsNumber(s("Team Ü"), 6),
        ConfigEntry(s("SEED"), strs(&["{abc}"])), ConfigEntry(s("SCHEME"), strs(&["Default", "false", "100"])),
        Kicked, RunGame, ForwardEngineMessage(strs(&["AQID", "BAUG"])), RoundFinished, ReplayStart,
        Info(strs(&["bob", "[1.2.3.4]", "<b>1.1</b>", "[lobby]"])), ServerMessage(s("<h3>Welcome</h3>")),
        ServerVars(strs(&["MOTD_NEW", "hello", "LATEST_PROTO", "60"])), BanList(strs(&["10.0.0.1", "spam", "1h"])),
        Notice(s("13")), Warning(s("careful")), Error(s("bad")), Replay(strs(&["AQID"])),
        LegacyReady(true, strs(&["alice"])), LegacyReady(false, strs(&["bob"])),
    ]
}

#[test]
fn golden_server_messages_parse_back() {
    // the golden server texts must be what the reference parser accepts
    // (the deprecated LegacyReady is only ever sent, the reference parser does not know it)
    for m in server_messages() {
        if matches!(m, S::LegacyReady(..)) {
            continue;
        }
        let raw = m.to_raw_protocol();
        assert_eq!(
            server_message(raw.as_bytes()).map(|(_, parsed)| parsed),
            Ok(m.clone()),
            "{:?}",
            raw
        );
    }
}

#[test]
#[ignore]
fn export_golden() {
    let path = std::env::var("HW_GOLDEN_OUT").expect("set HW_GOLDEN_OUT");
    let entry = |m: J, raw: String| J::Obj(vec![("msg", m), ("raw", J::Str(raw))]);
    let doc = J::Obj(vec![
        (
            "client",
            J::Arr(client_messages().iter().map(|m| entry(client_json(m), m.to_raw_protocol())).collect()),
        ),
        (
            "server",
            J::Arr(server_messages().iter().map(|m| entry(server_json(m), m.to_raw_protocol())).collect()),
        ),
    ]);
    let mut out = String::new();
    doc.render(&mut out);
    out.push('\n');
    std::fs::write(path, out).unwrap();
}
