use std::{
    collections::{HashMap, HashSet},
    net::IpAddr,
    time::{Duration, Instant},
};

pub struct JoinsMonitor {
    joins: HashMap<IpAddr, Vec<Instant>>,
    /// addresses without a reconnect limit (--reconnect-limit-exempt)
    exempt: HashSet<IpAddr>,
}

impl JoinsMonitor {
    pub fn new() -> Self {
        Self {
            joins: HashMap::new(),
            exempt: HashSet::new(),
        }
    }

    /// Never limit reconnects from `host` (e.g. a LAN or a test setup where
    /// all players share one address).
    pub fn exempt(&mut self, host: IpAddr) {
        self.exempt.insert(host);
    }

    pub fn check_and_record(&mut self, host: IpAddr) -> bool {
        if self.exempt.contains(&host) {
            return true;
        }
        let now = Instant::now();
        let timestamps = self.joins.entry(host).or_default();

        let last_30_sec = timestamps
            .iter()
            .take_while(|&&t| now.duration_since(t) < Duration::from_secs(30))
            .count();
        let last_2_min = timestamps
            .iter()
            .take_while(|&&t| now.duration_since(t) < Duration::from_secs(120))
            .count();
        let last_10_min = timestamps
            .iter()
            .take_while(|&&t| now.duration_since(t) < Duration::from_secs(600))
            .count();

        let pass = last_30_sec < 2 && last_2_min < 3 && last_10_min < 5;
        if pass {
            timestamps.insert(0, now);
        }
        pass
    }

    pub fn cleanup(&mut self) {
        let now = Instant::now();
        self.joins.retain(|_, v| {
            v.retain(|&t| now.duration_since(t) < Duration::from_secs(3600));
            !v.is_empty()
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn limits_fast_reconnects_except_for_exempt_addresses() {
        let mut monitor = JoinsMonitor::new();
        let limited: IpAddr = "192.0.2.1".parse().unwrap();
        let exempt: IpAddr = "192.0.2.2".parse().unwrap();
        monitor.exempt(exempt);
        assert!(monitor.check_and_record(limited));
        assert!(monitor.check_and_record(limited));
        assert!(!monitor.check_and_record(limited));
        for _ in 0..10 {
            assert!(monitor.check_and_record(exempt));
        }
    }
}
