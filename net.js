// Conexión entre móviles a través de un servidor MQTT público (por WebSocket seguro).
// Funciona con WiFi o datos móviles porque todos hablan con el servidor, no entre sí.
window.Net = (() => {
  const params = new URLSearchParams(location.search);
  const BROKERS = params.get("broker") ? [params.get("broker")] : [
    "wss://broker.hivemq.com:8884/mqtt",
    "wss://broker.emqx.io:8084/mqtt",
    "wss://test.mosquitto.org:8081/mqtt",
  ];
  const ROOT = "pulsadormusical/v1/";
  const rnd = (n) => Math.random().toString(36).slice(2, 2 + n).padEnd(n, "0");
  const cid = "c" + rnd(10); // identifica esta pestaña

  // handlers: { onMessage(topic, obj, retained), onUp(brokerIndex), onDown(), onNotFound() }
  // opts.probe: { topic, accept(obj, retained) } -> prueba cada servidor hasta encontrar la sala.
  // opts.broker: índice de servidor por el que empezar.
  function open(handlers, opts = {}) {
    let idx = opts.broker || 0, client = null, closed = false, found = !opts.probe, tried = 0, probeTimer = null;
    const subs = new Set();

    function next(delay) {
      if (closed) return;
      setTimeout(connect, delay);
    }
    function connect() {
      if (closed) return;
      const uri = BROKERS[idx % BROKERS.length];
      let c;
      try { c = new Paho.Client(uri, cid + rnd(4)); } catch { idx++; next(1000); return; }
      client = c;
      c.onConnectionLost = () => {
        if (closed || client !== c) return;
        handlers.onDown && handlers.onDown();
        next(1500); // reintenta el mismo servidor
      };
      c.onMessageArrived = (m) => {
        if (client !== c || !m.destinationName.startsWith(ROOT)) return;
        let o; try { o = JSON.parse(m.payloadString); } catch { return; }
        if (!o || typeof o !== "object") return;
        const topic = m.destinationName.slice(ROOT.length);
        if (!found && opts.probe && topic === opts.probe.topic && opts.probe.accept(o, m.retained)) {
          found = true; clearTimeout(probeTimer);
          handlers.onUp && handlers.onUp(idx % BROKERS.length);
        }
        if (found) handlers.onMessage(topic, o, m.retained);
      };
      c.connect({
        timeout: 7, keepAliveInterval: 20, cleanSession: true, mqttVersion: 4,
        onSuccess: () => {
          if (client !== c) return;
          for (const t of subs) c.subscribe(ROOT + t, { qos: 0 });
          if (found) { handlers.onUp && handlers.onUp(idx % BROKERS.length); return; }
          probeTimer = setTimeout(() => {
            if (found || client !== c) return;
            tried++;
            try { c.disconnect(); } catch {}
            if (tried >= BROKERS.length) { closed = true; handlers.onNotFound && handlers.onNotFound(); return; }
            idx++; next(0);
          }, opts.probe.timeout || 7000);
        },
        onFailure: () => {
          if (client !== c) return;
          handlers.onDown && handlers.onDown();
          if (!found) { tried++; if (tried >= BROKERS.length) { closed = true; handlers.onNotFound && handlers.onNotFound(); return; } }
          idx++; next(1000);
        },
      });
    }
    connect();

    return {
      cid,
      sub(t) { subs.add(t); try { if (client && client.isConnected()) client.subscribe(ROOT + t, { qos: 0 }); } catch {} },
      pub(t, obj, retained) {
        try {
          if (!client || !client.isConnected()) return false;
          const m = new Paho.Message(JSON.stringify(obj));
          m.destinationName = ROOT + t; m.qos = 0; m.retained = !!retained;
          client.send(m); return true;
        } catch { return false; }
      },
      connected() { try { return !!client && client.isConnected() && found; } catch { return false; } },
      broker() { return idx % BROKERS.length; },
      close() { closed = true; clearTimeout(probeTimer); try { client && client.disconnect(); } catch {} },
    };
  }
  return { open, cid };
})();
