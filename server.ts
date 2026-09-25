import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import {
  initDatabase,
  authenticateAdmin,
  verifySessionToken,
  invalidateSessionToken,
  createPasswordReset,
  resetPassword,
  changeAdminPassword,
  getAppointments,
  getAppointmentById,
  createAppointment,
  updateAppointmentStatus,
  updateAppointment,
  deleteAppointment,
  getContactMessages,
  createContactMessage,
  updateContactMessageStatus,
  deleteContactMessage,
  getDoctors,
  updateDoctor,
  getServices,
  updateService,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  clearNotifications,
  getDashboardStats,
  subscribeToEvents,
  registerPatient,
  authenticatePatient,
  verifyPatientSessionToken,
  invalidatePatientSessionToken,
  getPatientById,
  getAllPatients,
  updatePatientProfile,
  changePatientPassword,
  getPatientAppointments,
  cancelPatientAppointment,
  getPatientNotifications,
  markPatientNotificationRead,
  markAllPatientNotificationsRead,
  createPatientNotification,
  updateAppointmentSMSStatus,
} from './server/db';
import {
  sendAppointmentConfirmationSMS,
  sanitizeIndianMobile,
  getSmsConfigurationStatus,
} from './server/smsService';

// Initialize persistent database
initDatabase();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '5mb' }));

// Helper: Extract bearer token
function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  const customHeader = req.headers['x-admin-token'] || req.headers['x-patient-token'];
  if (typeof customHeader === 'string' && customHeader) {
    return customHeader.trim();
  }
  return null;
}

// Authentication Middleware for Protected Admin API Routes
function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Admin authentication token required.' });
  }

  const { valid, user } = verifySessionToken(token);
  if (!valid || !user) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or expired admin session.' });
  }

  (req as any).adminUser = user;
  next();
}

// Authentication Middleware for Protected Patient Portal API Routes
function requirePatientAuth(req: Request, res: Response, next: NextFunction) {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Patient authentication token required.' });
  }

  const { valid, patient } = verifyPatientSessionToken(token);
  if (!valid || !patient) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or expired patient session.' });
  }

  (req as any).patient = patient;
  next();
}

// Lazy Gemini AI Client initialization
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// =========================================================================
// 1. PUBLIC API ROUTES
// =========================================================================

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    hospital: 'OJAS HOSPITAL Super-Specialty Hospital & Trauma Care',
    location: 'Shivam Square, Jamnagar, Gujarat',
    phone: '9316717565',
    doctors: ['Dr. Nildeep Moliya (MD Medicine)', 'Dr. Prachi Patel (MS Obstetrics & Gynecology)'],
  });
});

// Public Doctors list (Active)
app.get('/api/public/doctors', (_req: Request, res: Response) => {
  const doctors = getDoctors().filter((d) => d.active !== false);
  res.json({ success: true, count: doctors.length, doctors });
});

// Public Services list (Active)
app.get('/api/public/services', (_req: Request, res: Response) => {
  const services = getServices().filter((s) => s.active !== false);
  res.json({ success: true, count: services.length, services });
});

// Public Patient Appointment Booking
app.post('/api/appointments', async (req: Request, res: Response) => {
  try {
    const { patientName, patientPhone, doctorId, appointmentDate, timeSlot } = req.body;

    // 1. Validate required fields
    if (!patientName || typeof patientName !== 'string' || !patientName.trim()) {
      return res.status(400).json({ success: false, error: 'Full name is required.' });
    }
    if (patientName.trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Full name must be at least 2 characters.' });
    }

    const phoneValidation = sanitizeIndianMobile(patientPhone);
    if (!phoneValidation.valid) {
      return res.status(400).json({
        success: false,
        error: phoneValidation.error || 'Please provide a valid Indian 10-digit mobile number.',
      });
    }

    if (!doctorId || typeof doctorId !== 'string' || !doctorId.trim()) {
      return res.status(400).json({ success: false, error: 'Specialist doctor selection is required.' });
    }

    if (!appointmentDate || typeof appointmentDate !== 'string' || !appointmentDate.trim()) {
      return res.status(400).json({ success: false, error: 'Preferred appointment date is required.' });
    }

    if (!timeSlot || typeof timeSlot !== 'string' || !timeSlot.trim()) {
      return res.status(400).json({ success: false, error: 'Preferred time slot is required.' });
    }

    // 2. Save appointment to database FIRST
    const result = createAppointment({
      ...req.body,
      patientName: patientName.trim(),
      patientPhone: phoneValidation.mobile,
      doctorId: doctorId.trim(),
      appointmentDate: appointmentDate.trim(),
      timeSlot: timeSlot.trim(),
    });

    if (!result.success || !result.appointment) {
      return res.status(400).json(result);
    }

    const savedAppointment = result.appointment;

    // 3. Automatically send SMS AFTER appointment is successfully saved
    const smsResult = await sendAppointmentConfirmationSMS(savedAppointment);

    // 4. Update appointment with SMS delivery status
    const updateResult = updateAppointmentSMSStatus(savedAppointment.id, {
      smsStatus: smsResult.status,
      smsSentAt: smsResult.status === 'sent' ? smsResult.timestamp : undefined,
      smsError: smsResult.error,
      smsMessageId: smsResult.messageId,
    });

    const finalAppointment = updateResult.appointment || savedAppointment;

    // 5. Construct user-facing confirmation message
    const responseMessage = smsResult.success
      ? 'Appointment booked successfully. A confirmation SMS has been sent to your registered mobile number.'
      : 'Appointment booked successfully, but the confirmation SMS could not be sent. Please contact the hospital.';

    return res.status(201).json({
      success: true,
      message: responseMessage,
      bookingRef: result.bookingRef,
      appointment: finalAppointment,
      smsStatus: smsResult.status,
      smsSuccess: smsResult.success,
      smsMessage: responseMessage,
      smsError: smsResult.error,
    });
  } catch (error: any) {
    console.error('[API /api/appointments] Error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Booking failed' });
  }
});

// Public Patient Appointment Tracking / Lookup
app.get('/api/appointments/lookup', (req: Request, res: Response) => {
  const { query } = req.query;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ success: false, error: 'Reference code or phone number required' });
  }
  const q = query.trim().toLowerCase();
  const all = getAppointments();
  const match = all.filter(
    (a) =>
      a.bookingRef.toLowerCase() === q ||
      a.patientPhone.replace(/\D/g, '') === q.replace(/\D/g, '')
  );

  // Return only sanitized view for public lookup
  const safeMatches = match.map((a) => ({
    id: a.id,
    bookingRef: a.bookingRef,
    patientName: a.patientName,
    doctorName: a.doctorName,
    department: a.department,
    appointmentDate: a.appointmentDate,
    timeSlot: a.timeSlot,
    status: a.status,
    visitType: a.visitType,
    createdAt: a.createdAt,
  }));

  res.json({ success: true, appointments: safeMatches });
});

// Public Contact Form Submission
app.post('/api/contact', (req: Request, res: Response) => {
  const { name, phone, email, subject, message } = req.body;
  if (!name || !phone || !message) {
    return res.status(400).json({ success: false, error: 'Name, phone, and message are required.' });
  }
  const result = createContactMessage({ name, phone, email, subject, message });
  res.json({
    success: true,
    message: 'Thank you! Your message has been sent to OJAS Hospital staff.',
    ticketId: result.messageId,
  });
});

// AI Health Assistant Endpoint
app.post('/api/ai-assistant', async (req: Request, res: Response) => {
  const { message } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ success: false, error: 'Message is required.' });
  }

  const HOSPITAL_PROMPT_CONTEXT = `
You are the official AI Clinical Health Assistant for OJAS HOSPITAL Super-Specialty Hospital & Trauma Care in Jamnagar, Gujarat, India.
Hospital Details:
- Name: OJAS HOSPITAL Super-Specialty Hospital & Trauma Care
- Location: Shivam Square, First Floor, Street No. 2, Shrinivas Colony, Jamnagar - 361005, Gujarat, India.
- Phone / Emergency Hotline: 9316717565
- Doctors:
  1. Dr. Nildeep Moliya — MD Medicine (Consultant Physician & Critical Care Specialist). Expertise: Diabetes, Hypertension, Fevers (Dengue/Malaria/Typhoid), Thyroid, Respiratory, ICU care, Geriatric medicine.
  2. Dr. Prachi Patel — MS Obstetrics & Gynecology (Consultant Obstetrician, Gynecologist & Laparoscopic Surgeon). Expertise: Pregnancy care, High-risk delivery, PCOD/PCOS, Infertility workup, Laparoscopy, Menstrual health, Cervical cancer screening (Pap smear).
- OPD Timings: Monday to Saturday 09:30 AM - 01:30 PM & 05:00 PM - 08:30 PM; Sunday: 10:00 AM - 01:00 PM.
- Key Facilities: Air-conditioned modern OPD, Modular Operation Theatre, Labor Room, In-patient Daycare recovery beds, Diagnostic Lab tie-ups, 24/7 Emergency & Maternity support.

Tone & Instructions:
1. Be warm, empathetic, professional, clear, and reassuring.
2. If the user mentions health symptoms, recommend whether they should consult Dr. Nildeep Moliya (general medicine/fever/diabetes/chest/BP) or Dr. Prachi Patel (women's health/pregnancy/PCOD/period issues).
3. If they describe red-flag emergency symptoms (chest pain, acute breathlessness, high fever with altered sensorium, sudden heavy vaginal bleeding, active labor pains), immediately urge them to call 9316717565 or visit OJAS Hospital emergency triage at Shivam Square, Jamnagar right away.
4. Support English, Hindi, and Gujarati inquiries naturally.
`;

  try {
    const ai = getGeminiClient();
    if (ai) {
      const chat = ai.chats.create({
        model: 'gemini-3.7-flash',
        config: {
          systemInstruction: HOSPITAL_PROMPT_CONTEXT,
          temperature: 0.7,
        },
      });

      const response = await chat.sendMessage({
        message: message.trim(),
      });

      const replyText =
        response.text ||
        'I am here to assist you with information about OJAS Hospital Jamnagar, our doctors Dr. Nildeep Moliya and Dr. Prachi Patel, appointment booking, and clinical information.';

      return res.json({
        success: true,
        reply: replyText,
        source: 'gemini-3.7-flash',
      });
    }
  } catch (err: any) {
    console.error('Gemini API fallback triggered:', err?.message);
  }

  // Clinical Fallback Rule-Engine
  const q = message.toLowerCase();
  let fallbackReply = '';

  if (q.includes('doctor') || q.includes('nildeep') || q.includes('prachi')) {
    fallbackReply = `At **OJAS HOSPITAL Super-Specialty Hospital & Trauma Care**, our expert consultants are:\n\n1. **Dr. Nildeep Moliya (MD Medicine)**\n   • Consultant Physician & Critical Care Specialist\n   • Specializes in Diabetes, High BP, Infectious Fevers, Thyroid, Respiratory & Family Health.\n\n2. **Dr. Prachi Patel (MS Obstetrics & Gynecology)**\n   • Consultant Obstetrician, Gynecologist & Laparoscopic Surgeon\n   • Specializes in Pregnancy & Delivery, High-Risk Maternity, PCOD/PCOS, Infertility, Laparoscopic Surgery.\n\nWould you like to book an appointment with either doctor today? Call us directly at **9316717565** or use our online booking form!`;
  } else if (q.includes('address') || q.includes('location') || q.includes('where') || q.includes('jamnagar')) {
    fallbackReply = `🏥 **OJAS Hospital Location:**\n\n**Shivam Square, First Floor, Street No. 2, Shrinivas Colony, Jamnagar - 361005, Gujarat, India.**\n\n📍 Landmark: Street No. 2, Shrinivas Colony.\n📞 Contact Phone: **9316717565**`;
  } else if (q.includes('time') || q.includes('timing') || q.includes('opd') || q.includes('hours') || q.includes('sunday')) {
    fallbackReply = `⏰ **OPD Consultation Timings at OJAS Hospital:**\n\n• **Monday to Saturday:**\n  - Morning: 09:30 AM – 01:30 PM\n  - Evening: 05:00 PM – 08:30 PM\n\n• **Sunday:**\n  - 10:00 AM – 01:00 PM (Emergency & Prior Booking)\n\n• **Emergency & Maternity:** Available 24/7. Call **9316717565** for urgent assistance.`;
  } else if (q.includes('pregnant') || q.includes('delivery') || q.includes('maternity') || q.includes('baby')) {
    fallbackReply = `🤰 **Maternity & Pregnancy Care at OJAS:**\n\nUnder the care of **Dr. Prachi Patel (MS Obstetrics & Gynecology)**, we offer:\n• Comprehensive Antenatal Checkups\n• High-Risk Pregnancy Monitoring & Fetal NST\n• Normal Delivery & Painless Labor Support\n• Modern Modular OT for LSCS\n• Postnatal Care & Lactation Support\n\nCall **9316717565** to schedule your appointment.`;
  } else if (q.includes('fever') || q.includes('cough') || q.includes('diabetes') || q.includes('sugar') || q.includes('bp')) {
    fallbackReply = `🩺 **General Medicine & Physician Care:**\n\n**Dr. Nildeep Moliya (MD Medicine)** provides comprehensive evaluation for fever, diabetes, blood pressure, and chronic illnesses.\n\nWe recommend visiting our OPD at Shivam Square, Jamnagar or calling **9316717565** to schedule a consultation.`;
  } else {
    fallbackReply = `Hello! I am your AI Health Assistant at **OJAS HOSPITAL Super-Specialty Hospital & Trauma Care** in Jamnagar.\n\nHow can I assist you today?\n• **Book an Appointment** with Dr. Nildeep Moliya or Dr. Prachi Patel\n• **Maternity & Women's Health Services**\n• **General Medicine & Diabetes Care**\n• **Hospital Timings & Location (Shivam Square, Jamnagar)**\n\nCall our desk directly at **9316717565**.`;
  }

  res.json({
    success: true,
    reply: fallbackReply,
    source: 'ojas-clinical-knowledgebase',
  });
});

// =========================================================================
// 2. PATIENT PORTAL API ROUTES (REGISTRATION, AUTH, PROFILE, APPOINTMENTS)
// =========================================================================

// Patient Registration
app.post('/api/patient/register', (req: Request, res: Response) => {
  try {
    const result = registerPatient(req.body);
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.status(201).json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message || 'Registration failed' });
  }
});

// Patient Login
app.post('/api/patient/login', (req: Request, res: Response) => {
  const { email, phone, identifier, password } = req.body;
  const target = (identifier || email || phone || '').trim();
  if (!target || !password) {
    return res.status(400).json({ success: false, error: 'Email/Phone and password are required.' });
  }

  const result = authenticatePatient(target, password);
  if (!result.success) {
    return res.status(401).json(result);
  }
  return res.json(result);
});

// Patient Session Verification
app.get('/api/patient/verify', requirePatientAuth, (req: Request, res: Response) => {
  const patient = (req as any).patient;
  return res.json({ success: true, valid: true, patient });
});

app.post('/api/patient/verify', (req: Request, res: Response) => {
  const token = req.body.token || getBearerToken(req);
  if (!token) {
    return res.status(401).json({ valid: false, error: 'No token provided' });
  }
  const result = verifyPatientSessionToken(token);
  return res.json(result);
});

// Patient Logout
app.post('/api/patient/logout', (req: Request, res: Response) => {
  const token = req.body.token || getBearerToken(req);
  if (token) {
    invalidatePatientSessionToken(token);
  }
  return res.json({ success: true, message: 'Logged out successfully.' });
});

// Patient Profile: Get Profile
app.get('/api/patient/profile', requirePatientAuth, (req: Request, res: Response) => {
  const patient = (req as any).patient;
  return res.json({ success: true, patient });
});

// Patient Profile: Update Profile
app.put('/api/patient/profile', requirePatientAuth, (req: Request, res: Response) => {
  const patient = (req as any).patient;
  const result = updatePatientProfile(patient.id, req.body);
  if (!result.success) {
    return res.status(400).json(result);
  }
  return res.json({
    success: true,
    message: 'Profile updated successfully.',
    patient: result.patient,
  });
});

// Patient Profile: Change Password
app.post('/api/patient/change-password', requirePatientAuth, (req: Request, res: Response) => {
  const patient = (req as any).patient;
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ success: false, error: 'Current password and new password are required.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, error: 'New password must be at least 6 characters.' });
  }
  const result = changePatientPassword(patient.id, oldPassword, newPassword);
  if (!result.success) {
    return res.status(400).json(result);
  }
  return res.json(result);
});

// Patient Appointments: List upcoming, past, all
app.get('/api/patient/appointments', requirePatientAuth, (req: Request, res: Response) => {
  const patient = (req as any).patient;
  const data = getPatientAppointments(patient.id);
  return res.json({ success: true, ...data });
});

// Patient Appointments: Book appointment under authenticated account
app.post('/api/patient/appointments', requirePatientAuth, async (req: Request, res: Response) => {
  const patient = (req as any).patient;
  try {
    const rawPhone = req.body.patientPhone || patient.phone;
    const phoneValidation = sanitizeIndianMobile(rawPhone);
    if (!phoneValidation.valid) {
      return res.status(400).json({
        success: false,
        error: phoneValidation.error || 'Please provide a valid Indian 10-digit mobile number.',
      });
    }

    const appointmentData = {
      ...req.body,
      patientId: patient.id,
      patientNumber: patient.patientNumber,
      isRegisteredPatient: true,
      patientName: req.body.patientName || patient.name,
      patientPhone: phoneValidation.mobile,
      patientEmail: req.body.patientEmail || patient.email,
      patientAge: req.body.patientAge || patient.age,
      patientGender: req.body.patientGender || patient.gender,
      patientCity: req.body.patientCity || patient.city,
    };

    const result = createAppointment(appointmentData);
    if (!result.success || !result.appointment) {
      return res.status(400).json(result);
    }

    const savedAppointment = result.appointment;

    // Send confirmation SMS automatically
    const smsResult = await sendAppointmentConfirmationSMS(savedAppointment);
    const updateResult = updateAppointmentSMSStatus(savedAppointment.id, {
      smsStatus: smsResult.status,
      smsSentAt: smsResult.status === 'sent' ? smsResult.timestamp : undefined,
      smsError: smsResult.error,
      smsMessageId: smsResult.messageId,
    });

    const finalAppointment = updateResult.appointment || savedAppointment;
    const responseMessage = smsResult.success
      ? 'Appointment booked successfully. A confirmation SMS has been sent to your registered mobile number.'
      : 'Appointment booked successfully, but the confirmation SMS could not be sent. Please contact the hospital.';

    return res.status(201).json({
      success: true,
      message: responseMessage,
      bookingRef: result.bookingRef,
      appointment: finalAppointment,
      smsStatus: smsResult.status,
      smsSuccess: smsResult.success,
      smsMessage: responseMessage,
      smsError: smsResult.error,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message || 'Booking failed' });
  }
});

// Patient Appointments: Cancel appointment
app.patch('/api/patient/appointments/:id/cancel', requirePatientAuth, (req: Request, res: Response) => {
  const patient = (req as any).patient;
  const { id } = req.params;
  const { reason } = req.body;
  const result = cancelPatientAppointment(patient.id, id, reason);
  if (!result.success) {
    return res.status(400).json(result);
  }
  return res.json(result);
});

app.post('/api/patient/appointments/:id/cancel', requirePatientAuth, (req: Request, res: Response) => {
  const patient = (req as any).patient;
  const { id } = req.params;
  const { reason } = req.body;
  const result = cancelPatientAppointment(patient.id, id, reason);
  if (!result.success) {
    return res.status(400).json(result);
  }
  return res.json(result);
});

// Patient Notifications: List notifications
app.get('/api/patient/notifications', requirePatientAuth, (req: Request, res: Response) => {
  const patient = (req as any).patient;
  const notifications = getPatientNotifications(patient.id);
  const unreadCount = notifications.filter((n) => !n.read).length;
  return res.json({ success: true, count: notifications.length, unreadCount, notifications });
});

// Patient Notifications: Mark single as read
app.patch('/api/patient/notifications/:id/read', requirePatientAuth, (req: Request, res: Response) => {
  const patient = (req as any).patient;
  const { id } = req.params;
  const result = markPatientNotificationRead(patient.id, id);
  return res.json(result);
});

// Patient Notifications: Mark all as read
app.post('/api/patient/notifications/mark-all-read', requirePatientAuth, (req: Request, res: Response) => {
  const patient = (req as any).patient;
  const result = markAllPatientNotificationsRead(patient.id);
  return res.json(result);
});

// =========================================================================
// 3. ADMIN AUTHENTICATION API ROUTES
// =========================================================================

// Admin Login
app.post('/api/admin/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required.' });
  }

  const result = authenticateAdmin(email, password);
  if (!result.success) {
    return res.status(401).json(result);
  }

  return res.json(result);
});

// Admin Session Verification
app.post('/api/admin/verify', (req: Request, res: Response) => {
  const token = req.body.token || getBearerToken(req);
  if (!token) {
    return res.status(401).json({ valid: false, error: 'No token provided' });
  }
  const result = verifySessionToken(token);
  return res.json(result);
});

// Admin Logout
app.post('/api/admin/logout', (req: Request, res: Response) => {
  const token = req.body.token || getBearerToken(req);
  if (token) {
    invalidateSessionToken(token);
  }
  return res.json({ success: true, message: 'Logged out successfully.' });
});

// Forgot Password (generate reset code)
app.post('/api/admin/forgot-password', (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, error: 'Email is required' });
  }
  const result = createPasswordReset(email);
  return res.json(result);
});

// Reset Password with code
app.post('/api/admin/reset-password', (req: Request, res: Response) => {
  const { resetCode, newPassword } = req.body;
  if (!resetCode || !newPassword) {
    return res.status(400).json({ success: false, error: 'Reset code and new password are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long' });
  }
  const result = resetPassword(resetCode, newPassword);
  return res.json(result);
});

// Change Password (while authenticated)
app.post('/api/admin/change-password', requireAdminAuth, (req: Request, res: Response) => {
  const adminUser = (req as any).adminUser;
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ success: false, error: 'Current and new password are required.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long.' });
  }
  const result = changeAdminPassword(adminUser.id, oldPassword, newPassword);
  return res.json(result);
});

// =========================================================================
// 3. ADMIN DASHBOARD & MANAGEMENT API ROUTES (PROTECTED)
// =========================================================================

// Real-time Server-Sent Events (SSE) Stream for Instant Live Updates
app.get('/api/admin/events', (req: Request, res: Response) => {
  // Check token via query param for EventSource compatibility
  const token = (req.query.token as string) || getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Token required for live sync.' });
  }
  const { valid } = verifySessionToken(token);
  if (!valid) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send initial ping
  res.write(`data: ${JSON.stringify({ event: 'connected', time: new Date().toISOString() })}\n\n`);

  // Subscribe to DB events
  const unsubscribe = subscribeToEvents((event, data) => {
    res.write(`data: ${JSON.stringify({ event, data })}\n\n`);
  });

  // Keep-alive heartbeat every 20 seconds
  const heartbeat = setInterval(() => {
    res.write(`data: ${JSON.stringify({ event: 'heartbeat', time: Date.now() })}\n\n`);
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

// Dashboard 8 Core Metrics & Counters
app.get('/api/admin/stats', requireAdminAuth, (_req: Request, res: Response) => {
  const stats = getDashboardStats();
  res.json({ success: true, stats });
});

// Appointments Management: List, Search, Filter, Sort
app.get('/api/admin/appointments', requireAdminAuth, (req: Request, res: Response) => {
  const { doctorId, status, search, date } = req.query;
  const list = getAppointments({
    doctorId: doctorId as string,
    status: status as string,
    search: search as string,
    date: date as string,
  });
  res.json({ success: true, count: list.length, appointments: list });
});

// Single Appointment
app.get('/api/admin/appointments/:id', requireAdminAuth, (req: Request, res: Response) => {
  const apt = getAppointmentById(req.params.id);
  if (!apt) {
    return res.status(404).json({ success: false, error: 'Appointment not found' });
  }
  res.json({ success: true, appointment: apt });
});

// Create appointment from admin desk
app.post('/api/admin/appointments', requireAdminAuth, async (req: Request, res: Response) => {
  const { patientPhone } = req.body;
  const phoneValidation = sanitizeIndianMobile(patientPhone);
  if (!phoneValidation.valid) {
    return res.status(400).json({
      success: false,
      error: phoneValidation.error || 'Please provide a valid Indian 10-digit mobile number.',
    });
  }

  const result = createAppointment({
    ...req.body,
    patientPhone: phoneValidation.mobile,
  });

  if (!result.success || !result.appointment) {
    return res.status(400).json(result);
  }

  const savedAppointment = result.appointment;

  // Send confirmation SMS automatically
  const smsResult = await sendAppointmentConfirmationSMS(savedAppointment);
  const updateResult = updateAppointmentSMSStatus(savedAppointment.id, {
    smsStatus: smsResult.status,
    smsSentAt: smsResult.status === 'sent' ? smsResult.timestamp : undefined,
    smsError: smsResult.error,
    smsMessageId: smsResult.messageId,
  });

  const finalAppointment = updateResult.appointment || savedAppointment;

  res.status(201).json({
    ...result,
    appointment: finalAppointment,
    smsStatus: smsResult.status,
    smsSuccess: smsResult.success,
    smsError: smsResult.error,
  });
});

// Admin Resend SMS Endpoint (Secure Backend Handler)
app.post('/api/admin/appointments/:id/resend-sms', requireAdminAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const appointment = getAppointmentById(id);
  if (!appointment) {
    return res.status(404).json({ success: false, error: 'Appointment not found.' });
  }

  try {
    const smsResult = await sendAppointmentConfirmationSMS(appointment, { forceResend: true });
    const updateResult = updateAppointmentSMSStatus(appointment.id, {
      smsStatus: smsResult.status,
      smsSentAt: smsResult.status === 'sent' ? smsResult.timestamp : appointment.smsSentAt,
      smsError: smsResult.error,
      smsMessageId: smsResult.messageId || appointment.smsMessageId,
    });

    const updatedAppt = updateResult.appointment || appointment;

    if (smsResult.success) {
      return res.json({
        success: true,
        message: `Confirmation SMS resent successfully to +91-${appointment.patientPhone}.`,
        smsStatus: 'sent',
        appointment: updatedAppt,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: smsResult.error || 'SMS delivery failed via provider.',
        smsStatus: 'failed',
        appointment: updatedAppt,
      });
    }
  } catch (error: any) {
    console.error(`[API /api/admin/appointments/${id}/resend-sms] Error:`, error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to process SMS resend.',
    });
  }
});

// Admin SMS Gateway Configuration Status (Reveals No Secrets)
app.get('/api/admin/sms/status', requireAdminAuth, (_req: Request, res: Response) => {
  const config = getSmsConfigurationStatus();
  res.json({ success: true, config });
});

// Update appointment status ('Pending' | 'Confirmed' | 'Completed' | 'Cancelled')
app.patch('/api/admin/appointments/:id/status', requireAdminAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, notes } = req.body;
  if (!status) {
    return res.status(400).json({ success: false, error: 'Status is required' });
  }
  const result = updateAppointmentStatus(id, status, notes);
  if (!result.success) {
    return res.status(404).json(result);
  }
  res.json(result);
});

// Edit appointment details
app.put('/api/admin/appointments/:id', requireAdminAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const result = updateAppointment(id, req.body);
  if (!result.success) {
    return res.status(404).json(result);
  }
  res.json(result);
});

// Delete appointment
app.delete('/api/admin/appointments/:id', requireAdminAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const result = deleteAppointment(id);
  if (!result.success) {
    return res.status(404).json(result);
  }
  res.json(result);
});

// Doctors Management (Strictly 2 Doctors)
app.get('/api/admin/doctors', requireAdminAuth, (_req: Request, res: Response) => {
  const doctors = getDoctors();
  res.json({ success: true, count: doctors.length, doctors });
});

app.put('/api/admin/doctors/:id', requireAdminAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const result = updateDoctor(id, req.body);
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json(result);
});

// Services Management
app.get('/api/admin/services', requireAdminAuth, (_req: Request, res: Response) => {
  const services = getServices();
  res.json({ success: true, count: services.length, services });
});

app.put('/api/admin/services/:id', requireAdminAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const result = updateService(id, req.body);
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json(result);
});

// Contact Messages Management
app.get('/api/admin/contact', requireAdminAuth, (_req: Request, res: Response) => {
  const messages = getContactMessages();
  res.json({ success: true, count: messages.length, messages });
});

app.patch('/api/admin/contact/:id/status', requireAdminAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  const result = updateContactMessageStatus(id, status);
  if (!result.success) {
    return res.status(404).json({ success: false, error: 'Message not found' });
  }
  res.json(result);
});

app.delete('/api/admin/contact/:id', requireAdminAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const result = deleteContactMessage(id);
  res.json(result);
});

// Real-Time Notifications Management
app.get('/api/admin/notifications', requireAdminAuth, (_req: Request, res: Response) => {
  const notifications = getNotifications();
  res.json({ success: true, count: notifications.length, notifications });
});

app.patch('/api/admin/notifications/:id/read', requireAdminAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const result = markNotificationRead(id);
  res.json(result);
});

app.post('/api/admin/notifications/mark-all-read', requireAdminAuth, (_req: Request, res: Response) => {
  const result = markAllNotificationsRead();
  res.json(result);
});

app.delete('/api/admin/notifications', requireAdminAuth, (_req: Request, res: Response) => {
  const result = clearNotifications();
  res.json(result);
});

// Admin Registered Patients Management
app.get('/api/admin/patients', requireAdminAuth, (req: Request, res: Response) => {
  const { search } = req.query;
  const list = getAllPatients(search as string);
  res.json({ success: true, count: list.length, patients: list });
});

app.get('/api/admin/patients/:id', requireAdminAuth, (req: Request, res: Response) => {
  const patient = getPatientById(req.params.id);
  if (!patient) {
    return res.status(404).json({ success: false, error: 'Patient not found' });
  }
  const appointments = getPatientAppointments(patient.id);
  res.json({ success: true, patient, appointments });
});

// =========================================================================
// 4. FRONTEND SERVING & SPA FALLBACK
// =========================================================================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`OJAS Hospital Server active on http://0.0.0.0:${PORT}`);
  });
}

startServer();
