export type PageId =
  | 'home'
  | 'about'
  | 'doctors'
  | 'services'
  | 'womens-healthcare'
  | 'family-healthcare'
  | 'general-medicine'
  | 'pregnancy-maternity'
  | 'health-packages'
  | 'appointment-booking'
  | 'contact'
  | 'faq'
  | 'ai-assistant'
  | 'patient-login'
  | 'patient-register'
  | 'patient-dashboard'
  | 'patient-profile'
  | 'patient-appointments'
  | 'admin-login'
  | 'admin-dashboard'
  | 'privacy-policy'
  | 'terms-conditions';

export type AdminTab =
  | 'dashboard'
  | 'appointments'
  | 'notifications'
  | 'doctors'
  | 'services'
  | 'contact'
  | 'settings';

export type PatientDashboardTab =
  | 'overview'
  | 'appointments'
  | 'book-appointment'
  | 'profile'
  | 'notifications'
  | 'settings';

export interface EmergencyContact {
  name: string;
  phone: string;
  relation: string;
}

export interface PatientUser {
  id: string;
  patientNumber: string; // e.g. OJAS-PT-8291
  name: string;
  email: string;
  phone: string;
  dateOfBirth?: string;
  age: number;
  gender: 'Female' | 'Male' | 'Other';
  address?: string;
  city?: string;
  emergencyContact?: EmergencyContact;
  bloodGroup?: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | 'Unknown';
  allergies?: string;
  medicalHistory?: string;
  currentMedications?: string;
  createdAt: string;
  updatedAt: string;
  lastLogin?: string;
}

export type PatientProfile = PatientUser;

export interface PatientNotification {
  id: string;
  patientId: string;
  title: string;
  message: string;
  type: 'appointment_booked' | 'appointment_confirmed' | 'appointment_completed' | 'appointment_cancelled' | 'profile_update' | 'system';
  appointmentId?: string;
  read: boolean;
  createdAt: string;
}

export interface Doctor {
  id: string;
  name: string;
  degree: string;
  designation: string;
  department: 'General Medicine' | 'Obstetrics & Gynecology';
  specialization: string;
  experienceYears: number;
  image?: string;
  about: string;
  specialities: string[];
  opdTimings: {
    morning: string;
    evening: string;
    sunday: string;
  };
  consultationFee?: number;
  languages: string[];
  education: string[];
  active?: boolean;
}

export interface ServiceItem {
  id: string;
  title: string;
  category: 'Women' | 'Family' | 'General Medicine' | 'Maternity' | 'Diagnostics' | 'Emergency';
  icon: string;
  shortDesc: string;
  fullDesc: string;
  keyFeatures: string[];
  suitableFor: string;
  active?: boolean;
  estimatedCost?: string;
}

export interface HealthPackage {
  id: string;
  title: string;
  tagline: string;
  recommendedFor: string;
  originalPrice?: number;
  discountedPrice?: number;
  badge?: string;
  parametersCount: number;
  testsIncluded: string[];
  popular?: boolean;
  consultationIncluded?: string;
  active?: boolean;
}

export interface Facility {
  id: string;
  title: string;
  description: string;
  icon: string;
  features: string[];
}

export interface AppointmentRecord {
  id: string;
  bookingRef: string;
  patientId?: string;
  patientNumber?: string;
  isRegisteredPatient?: boolean;
  patientName: string;
  patientAge: number;
  patientGender: 'Female' | 'Male' | 'Other';
  patientPhone: string;
  patientEmail?: string;
  patientCity: string;
  doctorId: string;
  doctorName: string;
  department: string;
  appointmentDate: string;
  timeSlot: string;
  visitType: 'New Consultation' | 'Follow-up' | 'Routine Checkup' | 'Second Opinion' | 'Package Consultation';
  symptoms: string;
  status: 'Pending' | 'Confirmed' | 'Completed' | 'Cancelled' | 'Rescheduled';
  createdAt: string;
  notes?: string;
  smsStatus?: 'pending' | 'sent' | 'failed';
  smsSentAt?: string;
  smsError?: string;
  smsMessageId?: string;
}

export type Appointment = AppointmentRecord;

export interface ContactMessage {
  id: string;
  name: string;
  phone: string;
  email?: string;
  subject: string;
  message: string;
  createdAt: string;
  status: 'Unread' | 'Replied' | 'Resolved';
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'Super Admin' | 'Doctor' | 'Hospital Staff';
  lastLogin?: string;
}

export interface DashboardStats {
  totalAppointments: number;
  pendingAppointments: number;
  confirmedAppointments: number;
  completedAppointments: number;
  cancelledAppointments: number;
  totalContactMessages: number;
  totalDoctors: number;
  totalServices: number;
  todayAppointments?: number;
  unreadMessages?: number;
}

export interface AdminNotification {
  id: string;
  title: string;
  message: string;
  type: 'new_appointment' | 'status_change' | 'new_message' | 'system';
  appointmentId?: string;
  read: boolean;
  createdAt: string;
  patientName?: string;
  doctorName?: string;
  bookingRef?: string;
}

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: 'General' | 'Women’s Health' | 'General Medicine' | 'Maternity' | 'Appointments & Billing';
}

export interface Testimonial {
  id: string;
  patientName: string;
  city: string;
  rating: number;
  review: string;
  treatment: string;
  doctorConsulted: string;
  date: string;
}
