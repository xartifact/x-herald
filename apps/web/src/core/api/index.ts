import { Hono } from 'hono';
import { authRoutes } from '@/features/auth';
import { providersRoutes } from '@/features/providers';
import { modelGroupsRoutes } from '@/features/model-groups';
import { keysRoutes } from '@/features/keys';
import { logsRoutes } from '@/features/logs';
import { gatewayRoutes } from '@/features/gateway';
import { healthRoutes } from '@/features/health';

const app = new Hono();

app.route('/auth', authRoutes);
app.route('/providers', providersRoutes);
app.route('/model-groups', modelGroupsRoutes);
app.route('/keys', keysRoutes);
app.route('/logs', logsRoutes);
app.route('/v1', gatewayRoutes);
app.route('/health', healthRoutes);

export default app;
