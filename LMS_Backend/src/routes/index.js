import { Router } from 'express';
import mongoose from 'mongoose';
import { ok } from '../utils/http.js';
import authRoutes from './auth.routes.js';
import organizationRoutes from './organization.routes.js';
import userRoutes from './user.routes.js';
import moduleRoutes from './module.routes.js';
import batchRoutes from './batch.routes.js';
import classRoutes from './class.routes.js';
import attendanceRoutes from './attendance.routes.js';
import assessmentRoutes from './assessment.routes.js';
import questionBankRoutes from './questionBank.routes.js';
import progressRoutes from './progress.routes.js';
import certificateRoutes from './certificate.routes.js';
import externalCertRoutes from './externalCert.routes.js';
import projectRoutes from './project.routes.js';
import techTagRoutes from './techTag.routes.js';
import profileRoutes from './profile.routes.js';
import analyticsRoutes from './analytics.routes.js';
import settingsRoutes from './settings.routes.js';
import resourceRoutes from './resource.routes.js';
import doubtRoutes from './doubt.routes.js';
import announcementRoutes from './announcement.routes.js';
import notificationRoutes from './notification.routes.js';
import auditRoutes from './audit.routes.js';

const router = Router();

router.get('/health', (_req, res) => {
  // Readiness: report 503 (not 200) when the DB is down, so a load balancer /
  // orchestrator stops routing traffic to an instance that can't serve.
  const dbUp = mongoose.connection.readyState === 1;
  res.status(dbUp ? 200 : 503).json({
    success: dbUp,
    data: { status: dbUp ? 'ok' : 'degraded', db: dbUp ? 'connected' : 'disconnected', time: new Date().toISOString() },
  });
});

router.use('/auth', authRoutes);
router.use('/organizations', organizationRoutes);
router.use('/users', userRoutes);
router.use('/modules', moduleRoutes);
router.use('/batches', batchRoutes);
router.use('/classes', classRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/assessments', assessmentRoutes);
router.use('/question-bank', questionBankRoutes);
router.use('/progress', progressRoutes);
router.use('/certificates', certificateRoutes);
router.use('/external-certificates', externalCertRoutes);
router.use('/projects', projectRoutes);
  router.use('/tech-tags', techTagRoutes);
router.use('/profile', profileRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/settings', settingsRoutes);
router.use('/resources', resourceRoutes);
router.use('/doubts', doubtRoutes);
router.use('/announcements', announcementRoutes);
router.use('/notifications', notificationRoutes);
router.use('/audit', auditRoutes);

export default router;
