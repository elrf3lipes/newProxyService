// Dependencies
const proxy = require("http-proxy");
const https = require("https");
const http = require("http");
const crypto = require("crypto");
const assert = require("assert");
const zlib = require("zlib");
const { URL } = require("url");

// Helper logging function with timestamp
const log = (msg, data) => {
  if (data) {
    console.log(`[${new Date().toISOString()}] ${msg}`, data);
  } else {
    console.log(`[${new Date().toISOString()}] ${msg}`);
  }
};

// Manual constants
const ALLOWED_GZIP_METHODS = ["transform", "decode", "append"];
const DEFAULT_USERAGENT = "Mozilla";
const OPEN_CLOUD_BASE = "https://apis.roblox.com";

// Environment Constants
const PORT = process.env.PORT || 80;
const ACCESS_KEY =
  process.env.ACCESS_KEY && Buffer.from(process.env.ACCESS_KEY);
const USE_WHITELIST = process.env.USE_WHITELIST === "true";
const USE_OVERRIDE_STATUS = process.env.USE_OVERRIDE_STATUS === "true";
const REWRITE_ACCEPT_ENCODING = process.env.REWRITE_ACCEPT_ENCODING === "true";
const APPEND_HEAD = process.env.APPEND_HEAD === "true";
const GZIP_METHOD = process.env.GZIP_METHOD;
const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY;

// Load Allowed Hosts from Environment Variable
const ALLOWED_HOSTS = (process.env.ALLOWED_HOSTS || "")
  .split(",")
  .map((host) => host.trim().toLowerCase());

if (USE_WHITELIST && ALLOWED_HOSTS.length === 0) {
  log("WARNING: USE_WHITELIST is enabled, but ALLOWED_HOSTS is empty.");
}

assert.ok(ACCESS_KEY, "Missing ACCESS_KEY");
assert.ok(
  ALLOWED_GZIP_METHODS.includes(GZIP_METHOD),
  `GZIP_METHOD must be one of: ${JSON.stringify(ALLOWED_GZIP_METHODS)}`,
);

const server = http.createServer();
const httpsProxy = proxy.createProxyServer({
  agent: new https.Agent({ checkServerIdentity: () => undefined }),
  changeOrigin: true,
});

const writeErr = (res, status, message) => {
  res.writeHead(status, { "Content-Type": "text/plain" });
  res.end(message);
};

const onProxyError = (err, req, res) => {
  log("Proxy error", { error: err.toString(), url: req.url });
  writeErr(res, 500, "Proxying failed");
};

const appendHead = (proxyRes, res, append) => {
  const encoding = proxyRes.headers["content-encoding"];
  let handler;
  let appendEncoded = append;

  if (encoding === "gzip") {
    handler = zlib.gzip;
    appendEncoded = undefined;
  }

  const _end = res.end;
  res.end = async () => {
    if (handler) {
      try {
        appendEncoded = await new Promise((resolve, reject) => {
          handler(append, (err, buf) => (err ? reject(err) : resolve(buf)));
        });
      } catch (e) {
        log("Gzip append error", e);
        return;
      }
    }

    res.write(appendEncoded);
    _end.call(res);
  };
};

const processResponse = (proxyRes, res, append) => {
  appendHead(proxyRes, res, append);
};

const onProxyReq = (proxyReq, req) => {
  log("Proxying request", { url: req.url, target: proxyReq.getHeader("host") });

  proxyReq.setHeader(
    "User-Agent",
    proxyReq.getHeader("proxy-override-user-agent") || DEFAULT_USERAGENT,
  );

  if (REWRITE_ACCEPT_ENCODING) {
    proxyReq.setHeader("Accept-Encoding", "gzip");
  }

  proxyReq.removeHeader("roblox-id");
  proxyReq.removeHeader("proxy-access-key");
  proxyReq.removeHeader("proxy-target");

  if (proxyReq.getHeader("host") === "apis.roblox.com" && ROBLOX_API_KEY) {
    proxyReq.setHeader("x-api-key", ROBLOX_API_KEY);
  }
};

const onProxyRes = (proxyRes, req, res) => {
  log("Received proxy response", {
    statusCode: proxyRes.statusCode,
    statusMessage: proxyRes.statusMessage,
  });

  const head = {
    headers: { ...proxyRes.headers },
    status: {
      code: proxyRes.statusCode,
      message: proxyRes.statusMessage,
    },
  };

  if (USE_OVERRIDE_STATUS) {
    proxyRes.statusCode = 200;
  }

  if (APPEND_HEAD) {
    const append = `"""${JSON.stringify(head)}"""`;
    processResponse(proxyRes, res, append);
  }
};

httpsProxy.on("error", onProxyError);
httpsProxy.on("proxyReq", onProxyReq);
httpsProxy.on("proxyRes", onProxyRes);

const doProxy = (parsedTarget, req, res) => {
  log("Forwarding request to", parsedTarget.origin);

  try {
    httpsProxy.web(req, res, { target: parsedTarget.origin });
  } catch (e) {
    log("doProxy error", e);
    writeErr(res, 500, "Proxying failed");
  }
};

server.on("request", (req, res) => {
  log("Incoming request", {
    method: req.method,
    url: req.url,
    headers: req.headers,
  });

  const accessKey = req.headers["proxy-access-key"];
  const requestedTarget = req.headers["proxy-target"];

  if (!accessKey || !requestedTarget) {
    log("Missing required headers");
    writeErr(res, 400, "proxy-access-key and proxy-target headers required");
    return;
  }

  const accessKeyBuffer = Buffer.from(accessKey);

  if (
    accessKeyBuffer.length === ACCESS_KEY.length &&
    crypto.timingSafeEqual(accessKeyBuffer, ACCESS_KEY)
  ) {
    let parsedTarget;
    try {
      parsedTarget = new URL(requestedTarget, OPEN_CLOUD_BASE);
    } catch (e) {
      log("Invalid target", requestedTarget);
      writeErr(res, 400, "Invalid target URL");
      return;
    }

    req.url = parsedTarget.pathname + parsedTarget.search;

    const requestedHost = parsedTarget.host.toLowerCase();
    let hostAllowed = !USE_WHITELIST;

    if (USE_WHITELIST) {
      hostAllowed = ALLOWED_HOSTS.includes(requestedHost);
    }

    if (hostAllowed) {
      log("Access granted", {
        host: requestedHost,
        path: parsedTarget.pathname,
      });
      doProxy(parsedTarget, req, res);
    } else {
      log("Host not whitelisted", requestedHost);
      writeErr(res, 400, "Host not whitelisted");
    }
  } else {
    log("Invalid access key", { provided: accessKey });
    writeErr(res, 403, "Invalid access key");
  }
});

server.listen(PORT, (err) => {
  if (err) {
    log("Server listen error", err);
    return;
  }
  log(`Server listening on port ${PORT}`);
});
