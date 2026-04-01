#!/usr/bin/env node
// PixelLab batch sprite generator for CarWorld
// Usage: node tools/pixellab_gen.js <batch_file.json>

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = '8a33c429-1ea4-489b-aa2d-0587bbfdd885';
const NEG = 'side view, front view, 3d render, realistic, ground, shadow, road, blurry, white background';

function genBitforge(opts) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      description: opts.desc,
      negative_description: opts.neg || NEG,
      image_size: { width: opts.w || 48, height: opts.h || 48 },
      text_guidance_scale: opts.guidance || 12,
      view: opts.view || 'high top-down',
      direction: opts.direction || 'south',
      isometric: false,
      oblique_projection: false,
      no_background: true,
      detail: 'highly detailed',
      seed: opts.seed || Math.floor(Math.random() * 99999)
    });
    const req = https.request({
      hostname: 'api.pixellab.ai', path: '/v1/generate-image-bitforge', method: 'POST',
      headers: { 'Authorization': 'Bearer ' + API_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.image) {
            const dir = path.dirname(opts.out);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            const buf = Buffer.from(json.image.base64, 'base64');
            fs.writeFileSync(opts.out, buf);
            console.log('OK: ' + opts.out + ' (' + buf.length + ' bytes)');
          } else {
            console.log('FAIL ' + opts.out + ': ' + JSON.stringify(json).substring(0, 200));
          }
        } catch(e) { console.log('ERR ' + opts.out + ': ' + e.message); }
        resolve();
      });
    });
    req.on('error', e => { console.log('NET: ' + e.message); resolve(); });
    req.write(body); req.end();
  });
}

async function main() {
  const batchFile = process.argv[2];
  if (!batchFile) {
    console.log('Usage: node tools/pixellab_gen.js <batch.json>');
    process.exit(1);
  }
  const batch = JSON.parse(fs.readFileSync(batchFile, 'utf8'));
  console.log('Generating ' + batch.length + ' sprites...');
  for (const item of batch) {
    await genBitforge(item);
  }
  console.log('BATCH COMPLETE');
}

main();
