#!/usr/bin/env node
/**
 * Example of streaming responses
 * Usage: node streaming-example.js
 */

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function main() {
  console.log('Streaming response...\n');

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: 'Write a short poem about coding.',
      },
    ],
  });

  // Stream text as it arrives
  stream.on('text', (text) => {
    process.stdout.write(text);
  });

  // Get final message
  const finalMessage = await stream.finalMessage();

  console.log('\n\nUsage:', finalMessage.usage);
  console.log('Stop reason:', finalMessage.stop_reason);
}

main().catch(console.error);
