import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { MotionBuffer } = await import('data:text/javascript;base64,' + Buffer.from(await readFile(new URL('../web/js/net-motion.js', import.meta.url))).toString('base64'));
const m = new MotionBuffer(0.08);
const point = x => new Map([['p', {x,y:0,face:0}]]);
m.push(1, point(100), 10);m.push(1.05, point(105), 10.05);m.push(1.1, point(110), 10.1);
assert(Math.abs(m.sample(10.1).get('p').x-102)<1e-6);
assert(Math.abs(m.sample(10.125).get('p').x-104.5)<1e-6);
// Jitter and out-of-order packets may not rewind presentation or grow memory unbounded.
m.push(1.075, point(-999), 10.13);
assert.equal(m.frames.length,3);
assert(m.sample(10.14).get('p').x>=104.5);
assert(Math.abs(m.sample(20).get('p').x-116)<1e-6); // capped extrapolation
m.push(2,point(900),20.1);
assert.equal(m.sample(21).get('p').x,900); // teleport, no sweep
for(let i=0;i<100;i++)m.push(3+i/20,point(i),30+i/20);
assert.equal(m.frames.length,32);
console.log('PASS: timestamp interpolation, stale frames, bounded extrapolation, teleport and memory');
