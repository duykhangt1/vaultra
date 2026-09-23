import { readdirSync, readFileSync, statSync } from 'node:fs';
import { Client, check, section, idem, inDays, sleep, summary, BASE, payOnVnpay } from './lib';

const PNG = 'data:image/png;base64,' + Buffer.alloc(400, 7).toString('base64');
