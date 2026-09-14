import { createServer } from "node:http";
import { fixtureSvg } from "./viewer-fixture";

/** In-memory storage double for browser upload flows; Compose CI separately validates real S3. */
export function startAssetServer() {
  const objects = new Map<string, { body: Buffer; contentType: string }>();
  createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET, HEAD, PUT, POST, DELETE, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "*");
    if (request.method === "OPTIONS") {
      response.writeHead(204).end();
      return;
    }
    const url = new URL(request.url ?? "/", "http://127.0.0.1:3102");
    const key = url.pathname.replace(/^\/e2e\//, "/");
    if (key === "/health") {
      response.end("ok");
      return;
    }
    if (request.method === "GET" && url.searchParams.has("list-type")) {
      const prefix = url.searchParams.get("prefix") ?? "";
      const contents = [...objects.keys()]
        .filter((name) => name.slice(1).startsWith(prefix))
        .map(
          (name) =>
            `<Contents><Key>${name.slice(1)}</Key><Size>${objects.get(name)!.body.length}</Size></Contents>`,
        )
        .join("");
      response.setHeader("Content-Type", "application/xml");
      response.end(
        `<ListBucketResult><IsTruncated>false</IsTruncated>${contents}</ListBucketResult>`,
      );
      return;
    }
    if (request.method === "PUT" || request.method === "POST") {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks);
      if (request.method === "POST" && url.searchParams.has("delete")) {
        for (const match of body.toString().matchAll(/<Key>([^<]+)<\/Key>/g))
          objects.delete(`/${match[1]}`);
        response.setHeader("Content-Type", "application/xml");
        response.end("<DeleteResult/>");
        return;
      }
      if (!key.startsWith("/groups/") && !key.startsWith("/internal-assets/")) {
        response.writeHead(400).end();
        return;
      }
      objects.set(key, {
        body,
        contentType: request.headers["content-type"] ?? "application/octet-stream",
      });
      response.setHeader("ETag", '"e2e"');
      response.end();
      return;
    }
    const fixture = /^\/internal-assets\/e2e\/(\d+)-(\d+)-([a-f0-9]{6})-(\d+)\.svg$/.exec(key);
    const object = fixture
      ? {
          body: Buffer.from(
            fixtureSvg(
              Number(fixture[1]),
              Number(fixture[2]),
              `#${fixture[3]}`,
              Number(fixture[4]),
            ),
          ),
          contentType: "image/svg+xml",
        }
      : objects.get(key);
    if (!object) {
      response.writeHead(404).end();
      return;
    }
    const range = /^bytes=(\d+)-(\d+)$/.exec(request.headers.range ?? "");
    const body = range ? object.body.subarray(Number(range[1]), Number(range[2]) + 1) : object.body;
    response.setHeader("Content-Type", object.contentType);
    response.setHeader("Content-Length", body.length);
    if (range)
      response.setHeader(
        "Content-Range",
        `bytes ${range[1]}-${Number(range[1]) + body.length - 1}/${object.body.length}`,
      );
    response.writeHead(range ? 206 : 200);
    response.end(request.method === "HEAD" ? undefined : body);
  }).listen(3102, "127.0.0.1");
}
