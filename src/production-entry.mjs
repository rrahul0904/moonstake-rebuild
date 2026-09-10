import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleProductionApi } from './production-server.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const publicDir=path.resolve(here,'../public');
const PORT=Number(process.env.PORT||4173);
const HOST=process.env.HOST||'127.0.0.1';
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.png':'image/png','.ico':'image/x-icon'};

function securityHeaders(){return {'x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'strict-origin-when-cross-origin','permissions-policy':'camera=(), microphone=(), geolocation=()','content-security-policy':"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-src https://checkout.stripe.com; connect-src 'self'"}}

function serveStatic(req,res,url){
  let pathname=decodeURIComponent(url.pathname);if(pathname==='/')pathname='/index.html';
  const candidate=path.resolve(publicDir,`.${pathname}`);
  if(!candidate.startsWith(publicDir)||!fs.existsSync(candidate)||fs.statSync(candidate).isDirectory()){
    res.writeHead(404,{'content-type':'text/plain; charset=utf-8',...securityHeaders()});return res.end('Not found');
  }
  const ext=path.extname(candidate).toLowerCase();
  if(pathname==='/index.html'){
    let html=fs.readFileSync(candidate,'utf8');
    html=html.replace('<script type="module" src="/app.js"></script>','<script src="/checkout-bridge.js"></script>\n  <script type="module" src="/app.js"></script>');
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-cache',...securityHeaders()});return res.end(html);
  }
  res.writeHead(200,{'content-type':mime[ext]||'application/octet-stream','cache-control':'public, max-age=3600',...securityHeaders()});
  fs.createReadStream(candidate).pipe(res);
}

export const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
    if(url.pathname.startsWith('/api/'))return await handleProductionApi(req,res,url);
    return serveStatic(req,res,url);
  }catch(err){
    console.error(err);
    if(!res.headersSent)res.writeHead(500,{'content-type':'application/json; charset=utf-8',...securityHeaders()});
    if(!res.writableEnded)res.end(JSON.stringify({error:'Internal server error'}));
  }
});

if(process.argv[1]===fileURLToPath(import.meta.url))server.listen(PORT,HOST,()=>console.log(`Moonstake production server running at http://${HOST}:${PORT}`));
