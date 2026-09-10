import { handleProductionApi } from '../src/production-server.mjs';

export const config = {
  api: { bodyParser: false },
  maxDuration: 30
};

export default async function handler(req,res) {
  try {
    const rawPath=Array.isArray(req.query?.__path)?req.query.__path.join('/'):String(req.query?.__path||'');
    const protocol=String(req.headers?.['x-forwarded-proto']||'https').split(',')[0];
    const host=req.headers?.host||'localhost';
    const url=new URL(req.url||'/',`${protocol}://${host}`);
    url.pathname=`/api/${rawPath.replace(/^\/+/, '')}`;
    url.searchParams.delete('__path');
    return await handleProductionApi(req,res,url);
  } catch(err) {
    console.error('vercel_api_error',err);
    if(!res.headersSent)res.writeHead(500,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
    if(!res.writableEnded)res.end(JSON.stringify({error:'Internal server error'}));
  }
}
