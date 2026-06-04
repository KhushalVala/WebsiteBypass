import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 });

    // Detect domain
    let domain = '';
    try {
      domain = new URL(url).hostname.replace('www.', '');
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    if (domain.includes('yorurl')) {
      const result = await bypassYorurl(url);
      return NextResponse.json(result);
    } else if (domain.includes('youlinks')) {
      const result = await bypassYoulinks(url);
      return NextResponse.json(result);
    } else {
      return NextResponse.json({ error: 'Unsupported link domain' }, { status: 400 });
    }
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

async function bypassYorurl(shortUrl: string) {
  const alias = shortUrl.split('/').pop();
  const landingUrl = `https://go.yorurl.com/${alias}`;

  const client = axios.create({
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
    },
    maxRedirects: 0,
    validateStatus: (status) => status < 400,
  });

  // 1. Get landing page
  const { data: html } = await client.get(landingUrl);
  const $ = cheerio.load(html);
  const form = $('#go-link');
  if (!form.length) throw new Error('Form not found');

  const payload: Record<string, string> = {};
  form.find('input').each((_, el) => {
    const name = $(el).attr('name');
    const value = $(el).attr('value') || '';
    if (name) payload[name] = value;
  });

  // 2. POST to /links/go
  const postRes = await client.post('https://go.yorurl.com/links/go', new URLSearchParams(payload), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: landingUrl,
    },
  });

  const json = postRes.data;
  if (json.url) {
    // Final redirect follow
    const final = await client.get(json.url, { maxRedirects: 5 });
    return { success: true, finalUrl: final.request.res.responseUrl || json.url };
  }
  throw new Error('No URL in response');
}

async function bypassYoulinks(shortUrl: string) {
  const alias = shortUrl.split('/').pop();
  const landingUrl = `https://youlinks.in/${alias}`;

  const client = axios.create({
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
    },
  });

  const { data: html } = await client.get(landingUrl);
  const $ = cheerio.load(html);
  const form = $('#go-link');
  if (!form.length) throw new Error('Form missing');

  const payload: Record<string, string> = {};
  form.find('input').each((_, el) => {
    const name = $(el).attr('name');
    const value = $(el).attr('value') || '';
    if (name) payload[name] = value;
  });

  const postRes = await client.post('https://youlinks.in/links/go', new URLSearchParams(payload), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: landingUrl,
    },
  });

  const json = postRes.data;
  if (json.url) {
    const final = await client.get(json.url, { maxRedirects: 5 });
    return { success: true, finalUrl: final.request.res.responseUrl || json.url };
  }
  throw new Error('No URL');
}
