import React, { useState, useEffect } from 'react';
import { PageId } from './types';
import { AdminAuthProvider, useAdminAuth } from './context/AdminAuthContext';
import { PatientAuthProvider } from './context/PatientAuthContext';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { MobileQuickBar } from './components/MobileQuickBar';
import { QuickAppointmentModal } from './components/QuickAppointmentModal';

// Public Pages
import { HomePage } from './pages/HomePage';
import { AboutPage } from './pages/AboutPage';
import { DoctorsPage } from './pages/DoctorsPage';
import { ServicesPage } from './pages/ServicesPage';
import { WomensHealthcarePage } from './pages/WomensHealthcarePage';
import { FamilyHealthcarePage } from './pages/FamilyHealthcarePage';
import { GeneralMedicinePage } from './pages/GeneralMedicinePage';
import { PregnancyMaternityPage } from './pages/PregnancyMaternityPage';
import { HealthPackagesPage } from './pages/HealthPackagesPage';
import { AppointmentBookingPage } from './pages/AppointmentBookingPage';
import { ContactPage } from './pages/ContactPage';
import { FaqPage } from './pages/FaqPage';
import { AiHealthAssistantPage } from './pages/AiHealthAssistantPage';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { TermsPage } from './pages/TermsPage';

// Patient Portal Pages
import { PatientLoginPage } from './pages/PatientLoginPage';
import { PatientDashboardPage } from './pages/PatientDashboardPage';

// Admin Pages
import { AdminLoginPage } from './pages/AdminLoginPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';

function AppContent() {
  const getInitialPage = (): PageId => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const rawHash = window.location.hash.replace('#', '').trim();
      if (rawHash === 'admin') return 'admin-login';
      if (rawHash === 'dashboard' || rawHash === 'admin/dashboard') return 'admin-dashboard';
      if (rawHash === 'patient' || rawHash === 'portal') return 'patient-dashboard';
      if (rawHash === 'login' || rawHash === 'patient/login') return 'patient-login';
      if (rawHash === 'register' || rawHash === 'patient/register') return 'patient-register';
      if (rawHash) return rawHash as PageId;
    }
    return 'home';
  };

  const [currentPage, setCurrentPage] = useState<PageId>(getInitialPage);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [preselectedDoctorId, setPreselectedDoctorId] = useState('dr-prachi-patel');
  const { isAuthenticated, isLoading: isAuthLoading } = useAdminAuth();

  // Sync hash routing if present
  useEffect(() => {
    const handleHashChange = () => {
      const rawHash = window.location.hash.replace('#', '').trim();
      if (rawHash) {
        if (rawHash === 'admin') {
          setCurrentPage('admin-login');
        } else if (rawHash === 'dashboard' || rawHash === 'admin/dashboard') {
          setCurrentPage('admin-dashboard');
        } else if (rawHash === 'patient' || rawHash === 'portal') {
          setCurrentPage('patient-dashboard');
        } else if (rawHash === 'login' || rawHash === 'patient/login') {
          setCurrentPage('patient-login');
        } else if (rawHash === 'register' || rawHash === 'patient/register') {
          setCurrentPage('patient-register');
        } else {
          setCurrentPage(rawHash as PageId);
        }
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigateTo = (page: PageId) => {
    setCurrentPage(page);
    window.location.hash = page;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenBooking = (doctorId?: string) => {
    if (doctorId) {
      setPreselectedDoctorId(doctorId);
    }
    setIsBookingModalOpen(true);
  };

  const handleCloseBooking = () => {
    setIsBookingModalOpen(false);
  };

  const isAdminView = currentPage === 'admin-login' || currentPage === 'admin-dashboard';
  const isPatientPortalView = currentPage === 'patient-dashboard' || currentPage === 'patient-profile' || currentPage === 'patient-appointments';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans antialiased selection:bg-teal-500 selection:text-white">
      {/* Show Public Header ONLY on public & patient pages (Admin has its own header) */}
      {!isAdminView && (
        <Header
          currentPage={currentPage}
          onNavigate={navigateTo}
          onOpenBooking={() => handleOpenBooking()}
        />
      )}

      {/* Main Content Area with Smooth Page Transition */}
      <main key={currentPage} className="flex-1 w-full overflow-x-hidden animate-fade-in">
        {currentPage === 'home' && (
          <HomePage onNavigate={navigateTo} onOpenBooking={handleOpenBooking} />
        )}
        {currentPage === 'about' && (
          <AboutPage onNavigate={navigateTo} onOpenBooking={handleOpenBooking} />
        )}
        {currentPage === 'doctors' && (
          <DoctorsPage onNavigate={navigateTo} onOpenBooking={handleOpenBooking} />
        )}
        {currentPage === 'services' && (
          <ServicesPage onNavigate={navigateTo} onOpenBooking={handleOpenBooking} />
        )}
        {currentPage === 'womens-healthcare' && (
          <WomensHealthcarePage onNavigate={navigateTo} onOpenBooking={handleOpenBooking} />
        )}
        {currentPage === 'family-healthcare' && (
          <FamilyHealthcarePage onNavigate={navigateTo} onOpenBooking={handleOpenBooking} />
        )}
        {currentPage === 'general-medicine' && (
          <GeneralMedicinePage onNavigate={navigateTo} onOpenBooking={handleOpenBooking} />
        )}
        {currentPage === 'pregnancy-maternity' && (
          <PregnancyMaternityPage onNavigate={navigateTo} onOpenBooking={handleOpenBooking} />
        )}
        {currentPage === 'health-packages' && (
          <HealthPackagesPage onNavigate={navigateTo} onOpenBooking={handleOpenBooking} />
        )}
        {currentPage === 'appointment-booking' && (
          <AppointmentBookingPage
            onNavigate={navigateTo}
            preselectedDoctorId={preselectedDoctorId}
          />
        )}
        {currentPage === 'contact' && (
          <ContactPage onNavigate={navigateTo} onOpenBooking={() => handleOpenBooking()} />
        )}
        {currentPage === 'faq' && (
          <FaqPage onNavigate={navigateTo} onOpenBooking={() => handleOpenBooking()} />
        )}
        {currentPage === 'ai-assistant' && (
          <AiHealthAssistantPage onNavigate={navigateTo} onOpenBooking={handleOpenBooking} />
        )}
        {currentPage === 'patient-login' && (
          <PatientLoginPage initialMode="login" onNavigate={navigateTo} />
        )}
        {currentPage === 'patient-register' && (
          <PatientLoginPage initialMode="register" onNavigate={navigateTo} />
        )}
        {currentPage === 'patient-dashboard' && (
          <PatientDashboardPage initialTab="overview" onNavigate={navigateTo} />
        )}
        {currentPage === 'patient-profile' && (
          <PatientDashboardPage initialTab="profile" onNavigate={navigateTo} />
        )}
        {currentPage === 'patient-appointments' && (
          <PatientDashboardPage initialTab="appointments" onNavigate={navigateTo} />
        )}
        {currentPage === 'admin-login' && (
          <AdminLoginPage onNavigate={navigateTo} />
        )}
        {currentPage === 'admin-dashboard' && (
          <AdminDashboardPage onNavigate={navigateTo} />
        )}
        {currentPage === 'privacy-policy' && (
          <PrivacyPolicyPage onNavigate={navigateTo} />
        )}
        {currentPage === 'terms-conditions' && (
          <TermsPage onNavigate={navigateTo} />
        )}
      </main>

      {/* Public Footer */}
      {!isAdminView && (
        <Footer onNavigate={navigateTo} onOpenBooking={() => handleOpenBooking()} />
      )}

      {/* Mobile Fixed Action Bar (Public Only - not in admin or patient dashboard to avoid overlapping UI) */}
      {!isAdminView && !isPatientPortalView && (
        <MobileQuickBar
          currentPage={currentPage}
          onNavigate={navigateTo}
          onOpenBooking={() => handleOpenBooking()}
        />
      )}

      {/* Global Quick Booking Modal */}
      <QuickAppointmentModal
        isOpen={isBookingModalOpen}
        onClose={handleCloseBooking}
        preselectedDoctorId={preselectedDoctorId}
      />
    </div>
  );
}

export function App() {
  return (
    <AdminAuthProvider>
      <PatientAuthProvider>
        <AppContent />
      </PatientAuthProvider>
    </AdminAuthProvider>
  );
}

export default App;
