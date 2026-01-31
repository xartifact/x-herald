/**
 * OpenAI API Tool Use Example
 * Function calling implementation
 */

const API_KEY = process.env.OPENAI_API_KEY;
const API_URL = 'https://api.openai.com/v1/chat/completions';

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: string;
  }>;
}

// Simulated weather function
function getWeather(location: string, unit: string = 'celsius'): string {
  console.log(`  [Executing getWeather: location=${location}, unit=${unit}]`);
  return JSON.stringify({
    location,
    temperature: unit === 'celsius' ? 22 : 72,
    unit,
    condition: 'sunny'
  });
}

async function toolUseExample(): Promise<void> {
  if (!API_KEY) {
    console.error('Error: OPENAI_API_KEY environment variable is required');
    process.exit(1);
  }

  const tools = [
    {
      type: 'function' as const,
      function: {
        name: 'get_weather',
        description: 'Get the current weather in a given location',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The city and state, e.g. San Francisco, CA',
            },
            unit: {
              type: 'string',
              enum: ['celsius', 'fahrenheit'],
            },
          },
          required: ['location'],
        },
      },
    },
  ];

  // Step 1: Send initial request with tools
  console.log('Step 1: Sending initial request with tools available...\n');

  const response1 = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'user', content: 'What is the weather in San Francisco?' }
      ],
      tools,
      tool_choice: 'auto',
    }),
  });

  const data1: ChatCompletionResponse = await response1.json();

  // Check if the model wants to use a tool
  if (data1.choices[0].finish_reason === 'tool_calls') {
    const toolCall = data1.choices[0].message.tool_calls![0];
    console.log('Model wants to use tool:');
    console.log(`  Name: ${toolCall.function.name}`);
    console.log(`  Arguments: ${toolCall.function.arguments}\n`);

    // Execute the function
    const args = JSON.parse(toolCall.function.arguments);
    const result = getWeather(args.location, args.unit);

    // Step 2: Send the tool result back
    console.log('\nStep 2: Sending tool result back to model...\n');

    const response2 = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'user', content: 'What is the weather in San Francisco?' },
          {
            role: 'assistant',
            content: null,
            tool_calls: [toolCall]
          },
          {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result,
          },
        ],
        tools,
      }),
    });

    const data2: ChatCompletionResponse = await response2.json();

    console.log('Final response:');
    console.log(data2.choices[0].message.content);
  } else {
    console.log('Model responded directly:');
    console.log(data1.choices[0].message.content);
  }
}

toolUseExample().catch(console.error);
