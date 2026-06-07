#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
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
    const data = await client.listProviders();
    console.table(data.map((p) => ({ ID: p.id, Name: p.name, Protocol: Object.keys(p.protocols).join(", "), Enabled: p.enabled })));
  });

providers.command('get <id>')
  .description('Get provider details')
  .action(async (id: string) => {
    const client = new GatewayClient({ baseUrl: program.opts().url, apiKey: program.opts().apiKey });
    const data = await client.getProvider(id);
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
    const data = await client.listModelGroups();
    console.table(data.map((g) => ({ ID: g.id, Name: g.name, Enabled: g.enabled })));
  });

// Keys
const keys = program.command('keys').description('Manage API keys');

keys.command('list')
  .description('List all keys')
  .action(async () => {
    const client = new GatewayClient({ baseUrl: program.opts().url, apiKey: program.opts().apiKey });
    const data = await client.listKeys();
    console.table(data.map((k) => ({ ID: k.id, Name: k.name, Enabled: k.enabled })));
  });

keys.command('create <name>')
  .description('Create a new key')
  .action(async (name: string) => {
    const client = new GatewayClient({ baseUrl: program.opts().url, apiKey: program.opts().apiKey });
    const data = await client.createKey({ name });
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
    if (status.status) {
      console.table(status.status.map((c) => ({ Name: c.name, Status: c.status, Message: c.message || '' })));
    }
  });

// Configure
const configure = program.command('configure').description('Configure AI tools to use x-llm-gateway');

configure.command('cursor')
  .description('Generate Cursor configuration')
  .option('-u, --url <url>', 'Gateway URL')
  .option('-k, --api-key <key>', 'Virtual API key')
  .action((opts: { url?: string; apiKey?: string }) => {
    const url = opts.url || program.opts().url;
    const key = opts.apiKey || program.opts().apiKey;
    console.log('=== Cursor Configuration ===');
    console.log('');
    console.log('Add these environment variables to your shell profile (~/.zshrc, ~/.bashrc):');
    console.log('');
    console.log(`export OPENAI_BASE_URL="${url}/api/v1"`);
    if (key) console.log(`export OPENAI_API_KEY="${key}"`);
    console.log('');
    console.log('Or set them in Cursor Settings > Models > OpenAI API Key and Base URL.');
  });

configure.command('claude-desktop')
  .description('Generate Claude Desktop configuration')
  .option('-u, --url <url>', 'Gateway URL')
  .option('-k, --api-key <key>', 'Virtual API key')
  .option('--apply', 'Automatically write to Claude Desktop config file')
  .action((opts: { url?: string; apiKey?: string; apply?: boolean }) => {
    const url = opts.url || program.opts().url;
    const key = opts.apiKey || program.opts().apiKey;

    if (opts.apply) {
      const configDir = join(homedir(), 'Library', 'Application Support', 'Claude');
      const configPath = join(configDir, 'claude_desktop_config.json');
      let config: Record<string, unknown> = {};
      if (existsSync(configPath)) {
        config = JSON.parse(readFileSync(configPath, 'utf-8'));
      }
      config.env = {
        ...((config.env as Record<string, string>) || {}),
        ANTHROPIC_BASE_URL: url,
        ...(key ? { ANTHROPIC_API_KEY: key } : {}),
      };
      mkdirSync(configDir, { recursive: true });
      writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log(`Configuration written to ${configPath}`);
      return;
    }

    console.log('=== Claude Desktop Configuration ===');
    console.log('');
    console.log('Add these to your Claude Desktop config file');
    console.log(`(${join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')}):`);
    console.log('');
    console.log(JSON.stringify({
      env: {
        ANTHROPIC_BASE_URL: url,
        ...(key ? { ANTHROPIC_API_KEY: key } : {}),
      },
    }, null, 2));
  });

configure.command('cline')
  .description('Generate Cline (VS Code extension) configuration')
  .option('-u, --url <url>', 'Gateway URL')
  .option('-k, --api-key <key>', 'Virtual API key')
  .action((opts: { url?: string; apiKey?: string }) => {
    const url = opts.url || program.opts().url;
    const key = opts.apiKey || program.opts().apiKey;
    console.log('=== Cline Configuration ===');
    console.log('');
    console.log('Add these environment variables to your shell profile (~/.zshrc, ~/.bashrc):');
    console.log('');
    console.log(`export OPENAI_BASE_URL="${url}/api/v1"`);
    if (key) console.log(`export OPENAI_API_KEY="${key}"`);
    console.log('');
    console.log('Or configure in VS Code Settings > Extensions > Cline > API Configuration.');
  });

configure.command('all')
  .description('Show configuration for all supported tools')
  .option('-u, --url <url>', 'Gateway URL')
  .option('-k, --api-key <key>', 'Virtual API key')
  .option('--apply', 'Automatically write Claude Desktop config (only for claude-desktop)')
  .action((opts: { url?: string; apiKey?: string; apply?: boolean }) => {
    const url = opts.url || program.opts().url;
    const key = opts.apiKey || program.opts().apiKey;

    // Cursor
    console.log('=== Cursor Configuration ===');
    console.log('');
    console.log('Add these environment variables to your shell profile (~/.zshrc, ~/.bashrc):');
    console.log('');
    console.log(`export OPENAI_BASE_URL="${url}/api/v1"`);
    if (key) console.log(`export OPENAI_API_KEY="${key}"`);
    console.log('');

    // Claude Desktop
    console.log('=== Claude Desktop Configuration ===');
    console.log('');
    if (opts.apply) {
      const configDir = join(homedir(), 'Library', 'Application Support', 'Claude');
      const configPath = join(configDir, 'claude_desktop_config.json');
      let config: Record<string, unknown> = {};
      if (existsSync(configPath)) {
        config = JSON.parse(readFileSync(configPath, 'utf-8'));
      }
      config.env = {
        ...((config.env as Record<string, string>) || {}),
        ANTHROPIC_BASE_URL: url,
        ...(key ? { ANTHROPIC_API_KEY: key } : {}),
      };
      mkdirSync(configDir, { recursive: true });
      writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log(`Configuration written to ${configPath}`);
      console.log('');
    } else {
      console.log(`Add these to your Claude Desktop config file (${join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')}):`);
      console.log('');
      console.log(JSON.stringify({
        env: {
          ANTHROPIC_BASE_URL: url,
          ...(key ? { ANTHROPIC_API_KEY: key } : {}),
        },
      }, null, 2));
      console.log('');
    }

    // Cline
    console.log('=== Cline Configuration ===');
    console.log('');
    console.log('Add these environment variables to your shell profile (~/.zshrc, ~/.bashrc):');
    console.log('');
    console.log(`export OPENAI_BASE_URL="${url}/api/v1"`);
    if (key) console.log(`export OPENAI_API_KEY="${key}"`);
    console.log('');
    console.log('Or configure in VS Code Settings > Extensions > Cline > API Configuration.');
  });

program.parse();
