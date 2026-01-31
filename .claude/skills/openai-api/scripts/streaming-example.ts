/**
 * OpenAI API Streaming Example
 * Server-Sent Events (SSE) streaming implementation
 */

const API_KEY = process.env.OPENAI_API_KEY;
const API_URL = 'https://api.openai.com/v1/chat/completions';

interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: string | null;
  }>;
}

async function streamChatCompletion(): Promise<void> {
  if (!API_KEY) {
    console.error('Error: OPENAI_API_KEY environment variable is required');
    process.exit(1);
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'user', content: 'Write a haiku about programming' }
      ],
      stream: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('API Error:', error);
    process.exit(1);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  console.log('Streaming response:\n');

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);

          if (data === '[DONE]') {
            console.log('\n\n[Stream complete]');
            return;
          }

          try {
            const chunk: ChatCompletionChunk = JSON.parse(data);
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              process.stdout.write(content);
            }
          } catch (error) {
            console.error('Parse error:', error);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

streamChatCompletion().catch(console.error);
