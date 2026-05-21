#!/usr/bin/env bun
import { Command } from 'commander';
import { GatewayClient } from './client';

const program = new Command();

program
  .name('xgate')
  .description('x-llm-gateway management CLI')
  .version('0.1.0')
  .option('-u, --url <url>', 'API base URL', process.env.XGATE_URL || 'http://localhost:3000')
  .option('-k, --api-key <key>', 'API key', process.env.XGATE_API_KEY);

// Providers
const providers = program.command('providers').description('Manage providers');

providers.command('list')
  .description('List all providers')
  .action(async () => {
    const client = new GatewayClient({ baseUrl: program.opts().url, apiKey: program.opts().apiKey });
    const { data } = await client.listProviders();
    console.table(data.map((p) => ({ ID: p.id, Name: p.name, Protocol: p.protocol, Enabled: p.enabled })));
  });

providers.command('get <id>')
  .description('Get provider details')
  .action(async (id: string) => {
    const client = new GatewayClient({ baseUrl: program.opts().url, apiKey: program.opts().apiKey });
    const { data } = await client.getProvider(id);
    console.log(JSON.stringify(data, null, 2));
  });

providers.command('delete <id>')
  .description('Delete a provider')
  .action(async (id: string) => {
    const client = new GatewayClient({ baseUrl: program.opts().url, apiKey: program.opts().apiKey });
    await client.deleteProvider(id);
    console.log(`Provider ${id} deleted`);
  });

// Models
const models = program.command('models').description('List models');
models.command('list')
  .description('List all model groups')
  .action(async () => {
    const client = new GatewayClient({ baseUrl: program.opts().url, apiKey: program.opts().apiKey });
    const { data } = await client.listModelGroups();
    console.table(data.map((g) => ({ ID: g.id, Name: g.name, Enabled: g.enabled })));
  });

// Keys
const keys = program.command('keys').description('Manage API keys');

keys.command('list')
  .description('List all keys')
  .action(async () => {
    const client = new GatewayClient({ baseUrl: program.opts().url, apiKey: program.opts().apiKey });
    const { data } = await client.listKeys();
    console.table(data.map((k) => ({ ID: k.id, Name: k.name, Enabled: k.enabled })));
  });

keys.command('create <name>')
  .description('Create a new key')
  .action(async (name: string) => {
    const client = new GatewayClient({ baseUrl: program.opts().url, apiKey: program.opts().apiKey });
    const { data } = await client.createKey({ name });
    console.log(`Key created: ${data.id}`);
    console.log(`Key value: ${data.key}`);
  });

keys.command('delete <id>')
  .description('Delete a key')
  .action(async (id: string) => {
    const client = new GatewayClient({ baseUrl: program.opts().url, apiKey: program.opts().apiKey });
    await client.deleteKey(id);
    console.log(`Key ${id} deleted`);
  });

// Health
program.command('health')
  .description('Check gateway health')
  .action(async () => {
    const client = new GatewayClient({ baseUrl: program.opts().url, apiKey: program.opts().apiKey });
    const status = await client.getHealth();
    console.log(`Status: ${status.status}`);
    if (status.checks) {
      console.table(status.checks.map((c) => ({ Name: c.name, Status: c.status, Message: c.message || '' })));
    }
  });

program.parse();
