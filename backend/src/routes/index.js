/**
 * API surface. Route -> middleware (auth, role, validation) -> controller.
 *
 * Authorisation is declared here so the whole access model can be read in one
 * file. The `admin` super-role passes every staff check via authorizeWithAdmin.
 */
import { Router } from 'express';

import {
  authenticate,
  authorize,
  authorizeWithAdmin,
  requireStaff,
  requireAdmin,
  requireCustomer,
} from '../middleware/auth.js';
import validate from '../middleware/validate.js';
import upload from '../middleware/upload.js';
import { ROLES } from '../constants/index.js';

import {
  authSchemas,
  eligibilitySchema,
  applicationSchemas,
  underwritingSchemas,
  loanSchemas,
  paymentSchemas,
  collectionSchemas,
  userSchemas,
  bankSchemas,
  configSchema,
  notificationSchemas,
  mockSchemas,
  testingSchemas,
  idParam,
  pagination,
} from '../validators/schemas.js';

import authController from '../controllers/authController.js';
import applicationController from '../controllers/applicationController.js';
import underwritingController from '../controllers/underwritingController.js';
import loanController from '../controllers/loanController.js';
import paymentController from '../controllers/paymentController.js';
import collectionsController from '../controllers/collectionsController.js';
import userController from '../controllers/userController.js';
import bankController from '../controllers/bankController.js';
import {
  eligibilityController,
  configController,
  dashboardController,
  notificationController,
  auditController,
  mockController,
  testingController,
  requireTestHooks,
} from '../controllers/miscControllers.js';

const router = Router();

/* ---------------------------- Auth ---------------------------- */

const auth = Router();
auth.post('/register', validate({ body: authSchemas.register }), authController.register);
auth.post('/login', validate({ body: authSchemas.login }), authController.login);
auth.post('/otp/request', validate({ body: authSchemas.requestOtp }), authController.requestOtp);
auth.post('/otp/verify', validate({ body: authSchemas.verifyOtp }), authController.verifyMobileOtp);
auth.get('/me', authenticate, authController.me);
auth.patch('/me', authenticate, validate({ body: authSchemas.updateProfile }), authController.updateProfile);
auth.post(
  '/change-password',
  authenticate,
  validate({ body: authSchemas.changePassword }),
  authController.changePassword
);
router.use('/auth', auth);

/* ------------------------ Eligibility ------------------------- */

// Public: pre-qualification runs before an account exists.
router.post('/eligibility/check', validate({ body: eligibilitySchema }), eligibilityController.check);
router.get('/product', eligibilityController.product);

/* ----------------------- Applications ------------------------- */

const applications = Router();
applications.use(authenticate);

applications.get('/', validate({ query: applicationSchemas.list }), applicationController.list);
applications.post(
  '/',
  requireCustomer,
  validate({ body: applicationSchemas.create }),
  applicationController.create
);
applications.get('/:id', validate({ params: idParam }), applicationController.detail);
applications.patch(
  '/:id',
  requireCustomer,
  validate({ params: idParam, body: applicationSchemas.update }),
  applicationController.update
);
applications.post('/:id/submit', requireCustomer, validate({ params: idParam }), applicationController.submit);
applications.post('/:id/withdraw', requireCustomer, validate({ params: idParam }), applicationController.withdraw);

applications.post(
  '/:id/kyc',
  requireCustomer,
  validate({ params: idParam, body: applicationSchemas.kyc }),
  applicationController.submitKyc
);

applications.get('/:id/documents', validate({ params: idParam }), applicationController.listDocuments);
applications.post(
  '/:id/documents',
  requireCustomer,
  validate({ params: idParam }),
  // Multer parses the multipart body before the field validator runs.
  upload.single('file'),
  validate({ body: applicationSchemas.document }),
  applicationController.uploadDocument
);

applications.post(
  '/:id/bureau',
  requireCustomer,
  validate({ params: idParam, body: applicationSchemas.bureau }),
  applicationController.pullBureau
);
applications.get('/:id/bureau', validate({ params: idParam }), applicationController.bureauReport);

applications.post('/:id/offer/accept', requireCustomer, validate({ params: idParam }), applicationController.acceptOffer);
applications.post(
  '/:id/agreement/otp',
  requireCustomer,
  validate({ params: idParam }),
  applicationController.requestAgreementOtp
);
applications.post(
  '/:id/agreement/sign',
  requireCustomer,
  validate({ params: idParam, body: applicationSchemas.esign }),
  applicationController.signAgreement
);

applications.post(
  '/:id/bank-account',
  requireCustomer,
  validate({ params: idParam, body: applicationSchemas.bankAccount }),
  applicationController.verifyBankAccount
);

applications.get('/:id/timeline', validate({ params: idParam }), applicationController.timeline);
applications.get('/:id/decisions', validate({ params: idParam }), underwritingController.history);

router.use('/applications', applications);

/* ----------------------- Underwriting ------------------------- */

const underwriting = Router();
underwriting.use(authenticate, authorizeWithAdmin(ROLES.CREDIT_OFFICER, ROLES.OPS_OFFICER));

underwriting.get('/queue', validate({ query: applicationSchemas.list }), underwritingController.queue);
underwriting.post(
  '/:id/decision',
  authorizeWithAdmin(ROLES.CREDIT_OFFICER),
  validate({ params: idParam, body: underwritingSchemas.decision }),
  underwritingController.decide
);

router.use('/underwriting', underwriting);

/* ------------------------- Documents -------------------------- */

const documents = Router();
documents.use(authenticate);

documents.get(
  '/pending',
  authorizeWithAdmin(ROLES.OPS_OFFICER, ROLES.CREDIT_OFFICER),
  validate({ query: pagination }),
  underwritingController.pendingDocuments
);
documents.patch(
  '/:documentId/verify',
  authorizeWithAdmin(ROLES.OPS_OFFICER, ROLES.CREDIT_OFFICER),
  validate({ body: applicationSchemas.verifyDocument }),
  underwritingController.verifyDocument
);
// The file itself. Owner or any staff member; authorisation is in the service.
documents.get('/:documentId/file', applicationController.documentFile);

// A customer may remove their own unverified upload; ops may remove any.
documents.delete('/:documentId', underwritingController.deleteDocument);

router.use('/documents', documents);

/* --------------------------- Loans ---------------------------- */

const loans = Router();
loans.use(authenticate);

loans.get('/', validate({ query: loanSchemas.list }), loanController.list);
loans.post(
  '/disburse/:applicationId',
  authorizeWithAdmin(ROLES.OPS_OFFICER),
  validate({ body: loanSchemas.disburse }),
  loanController.disburse
);
loans.get('/:id', validate({ params: idParam }), loanController.detail);
loans.get('/:id/schedule', validate({ params: idParam }), loanController.schedule);
loans.get('/:id/payments', validate({ params: idParam }), loanController.payments);
loans.get('/:id/foreclosure-quote', validate({ params: idParam }), loanController.foreclosureQuote);
loans.get('/:id/timeline', validate({ params: idParam }), loanController.timeline);
loans.get('/:id/schedule.pdf', validate({ params: idParam }), loanController.schedulePdf);
loans.get('/:id/statement.pdf', validate({ params: idParam }), loanController.statementPdf);
loans.get('/:id/noc.pdf', validate({ params: idParam }), loanController.nocPdf);

router.use('/loans', loans);

/* ------------------------- Payments --------------------------- */

const payments = Router();
payments.use(authenticate);

payments.get('/', validate({ query: paymentSchemas.list }), paymentController.list);
payments.post(
  '/initiate',
  requireCustomer,
  validate({ body: paymentSchemas.initiate }),
  paymentController.initiate
);
payments.post(
  '/confirm',
  requireCustomer,
  validate({ body: paymentSchemas.confirm }),
  paymentController.confirm
);
payments.post(
  '/record',
  authorizeWithAdmin(ROLES.OPS_OFFICER, ROLES.COLLECTIONS_OFFICER),
  validate({ body: paymentSchemas.record }),
  paymentController.record
);

router.use('/payments', payments);

/* ------------------------ Collections ------------------------- */

const collections = Router();
collections.use(authenticate, authorizeWithAdmin(ROLES.COLLECTIONS_OFFICER));

collections.get('/overview', collectionsController.overview);
collections.get('/accounts', validate({ query: collectionSchemas.list }), collectionsController.accounts);
collections.get('/:loanId/notes', collectionsController.listNotes);
collections.post(
  '/:loanId/notes',
  validate({ body: collectionSchemas.note }),
  collectionsController.addNote
);
collections.post('/remind', validate({ body: collectionSchemas.remind }), collectionsController.sendReminders);

router.use('/collections', collections);

/* --------------------------- Users ---------------------------- */

const users = Router();
users.use(authenticate, requireAdmin);

users.get('/', validate({ query: userSchemas.list }), userController.list);
users.post('/', validate({ body: userSchemas.create }), userController.create);
users.get('/:id', validate({ params: idParam }), userController.detail);
users.patch('/:id', validate({ params: idParam, body: userSchemas.update }), userController.update);
users.delete('/:id', validate({ params: idParam }), userController.deactivate);

router.use('/users', users);

/* --------------------------- Banks ---------------------------- */

const banks = Router();
banks.use(authenticate);

// Ops needs to read the bank list to pick a disbursement account.
banks.get('/', requireStaff, validate({ query: bankSchemas.list }), bankController.list);
banks.get('/:id', requireStaff, validate({ params: idParam }), bankController.detail);
banks.post('/', requireAdmin, validate({ body: bankSchemas.create }), bankController.create);
banks.patch('/:id', requireAdmin, validate({ params: idParam, body: bankSchemas.update }), bankController.update);
banks.delete('/:id', requireAdmin, validate({ params: idParam }), bankController.remove);

router.use('/banks', banks);

/* -------------------------- Config ---------------------------- */

const config = Router();
config.use(authenticate, requireAdmin);
config.get('/', configController.get);
config.put('/', validate({ body: configSchema }), configController.update);
router.use('/config', config);

/* ------------------------ Dashboards -------------------------- */

const dashboard = Router();
dashboard.use(authenticate);
dashboard.get('/', dashboardController.auto);
dashboard.get('/customer', requireCustomer, dashboardController.customer);
dashboard.get('/admin', requireStaff, dashboardController.admin);
router.use('/dashboard', dashboard);

/* ----------------------- Notifications ------------------------ */

const notifications = Router();
notifications.use(authenticate);
notifications.get('/', validate({ query: notificationSchemas.list }), notificationController.list);
notifications.patch('/:id/read', validate({ params: idParam }), notificationController.markRead);
notifications.post('/read-all', notificationController.markAllRead);
router.use('/notifications', notifications);

/* --------------------------- Audit ---------------------------- */

router.get('/audit', authenticate, requireAdmin, validate({ query: pagination }), auditController.list);

/* --------------------- Mock integrations ---------------------- */

const mocks = Router();
mocks.use(authenticate, requireStaff);
mocks.post('/kyc/verify', validate({ body: mockSchemas.kyc }), mockController.kyc);
mocks.post('/bureau/score', validate({ body: mockSchemas.bureau }), mockController.bureau);
mocks.post('/penny-drop', validate({ body: mockSchemas.pennyDrop }), mockController.pennyDrop);
mocks.post('/payment/order', validate({ body: mockSchemas.order }), mockController.createOrder);
mocks.post('/payment/verify', mockController.verifyOrder);
mocks.get('/outbox', mockController.outbox);
router.use('/mock', mocks);

/* ------------------------ Test hooks -------------------------- */

const testing = Router();
testing.use(requireTestHooks, authenticate, requireAdmin);
testing.post('/backdate-loan', validate({ body: testingSchemas.backdate }), testingController.backdateLoan);
testing.post('/reset', validate({ body: testingSchemas.reset }), testingController.reset);
testing.post('/sweep', testingController.sweep);
router.use('/testing', testing);

/* --------------------------- Roles ---------------------------- */

router.get('/roles', authenticate, requireAdmin, (_req, res) =>
  res.json({ success: true, data: { roles: Object.values(ROLES) } })
);

export default router;
