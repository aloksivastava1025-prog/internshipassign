import { useEffect, useState } from 'react';
import {
  adminCredentials,
  getSessionUser,
  initializeStorage,
  isLiveStorageEnabled,
  loginUser,
  logoutUser,
  persistenceMode,
  saveRegistration,
  signInWithGoogle,
  signupUser,
  subscribeToRegistrationForUser,
  subscribeToRegistrations,
} from './storage';

const initialFormState = {
  name: '',
  email: '',
  contactNumber: '',
  dateOfBirth: '',
  location: '',
  languages: '',
  availability: [],
};

const availabilityOptions = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

const stepMeta = [
  {
    id: 1,
    title: 'Contact Info',
    description: 'Share your name, email, phone number, and date of birth.',
  },
  {
    id: 2,
    title: 'Other Details',
    description: 'Add your location, languages, and weekly availability.',
  },
];

function App() {
  const [mode, setMode] = useState('login');
  const [authEntry, setAuthEntry] = useState('volunteer');
  const [authForm, setAuthForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
  });
  const [authError, setAuthError] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [activeStep, setActiveStep] = useState(1);
  const [formData, setFormData] = useState(initialFormState);
  const [formMessage, setFormMessage] = useState('');
  const [registrations, setRegistrations] = useState([]);
  const [showPassword, setShowPassword] = useState(false);
  const [authTheme, setAuthTheme] = useState('dark');
  const [adminTheme, setAdminTheme] = useState('light');
  const [adminSearch, setAdminSearch] = useState('');
  const [selectedRegistrationId, setSelectedRegistrationId] = useState('');
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    const boot = async () => {
      try {
        await initializeStorage();
      } catch (error) {
        // Non-fatal: show a banner but don't block the UI
        setStorageError(error.message);
      } finally {
        // Always restore session from localStorage regardless of Firebase state
        const sessionUser = getSessionUser();
        if (sessionUser) {
          setCurrentUser(sessionUser);
        }
        setStorageReady(true);
      }
    };

    boot();
  }, []);

  useEffect(() => {
    if (!currentUser || !storageReady) {
      return;
    }

    if (currentUser.role === 'admin') {
      const unsubscribe = subscribeToRegistrations((nextRegistrations) => {
        setRegistrations(nextRegistrations);
      });

      return () => unsubscribe();
    }

    const unsubscribe = subscribeToRegistrationForUser(currentUser.id, (existingForm) => {
      setFormData(
        existingForm
          ? {
              ...initialFormState,
              ...existingForm,
            }
          : {
              ...initialFormState,
              name: currentUser.name,
              email: currentUser.email,
            },
      );
    });

    return () => unsubscribe();
  }, [currentUser, storageReady]);

  const handleGoogleSignIn = async () => {
    setAuthError('');
    setGoogleLoading(true);
    try {
      const user = await signInWithGoogle();
      setCurrentUser(user);
      setActiveStep(1);
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleAuthInputChange = (event) => {
    const { name, value } = event.target;
    setAuthForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setAuthError('');

    try {
      const user =
        mode === 'signup' && authEntry !== 'admin'
          ? signupUser({
              name: `${authForm.firstName} ${authForm.lastName}`.trim(),
              email: authForm.email,
              password: authForm.password,
            })
          : loginUser({
              email: authForm.email,
              password: authForm.password,
            });

      setCurrentUser(await user);
      setAuthForm({ firstName: '', lastName: '', email: '', password: '' });
      setActiveStep(1);
      setShowPassword(false);
    } catch (error) {
      setAuthError(error.message);
    }
  };

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
    setFormMessage('');
  };

  const handleAvailabilityToggle = (day) => {
    setFormData((previous) => {
      const isSelected = previous.availability.includes(day);
      return {
        ...previous,
        availability: isSelected
          ? previous.availability.filter((entry) => entry !== day)
          : [...previous.availability, day],
      };
    });
    setFormMessage('');
  };

  const validateStep = (stepId) => {
    if (stepId === 1) {
      return Boolean(
        formData.name &&
          formData.email &&
          formData.contactNumber &&
          formData.dateOfBirth,
      );
    }

    return Boolean(
      formData.location &&
        formData.languages &&
        formData.availability.length > 0,
    );
  };

  const validateCurrentStep = () => validateStep(activeStep);

  const isStepComplete = (stepId) => {
    return validateStep(stepId);
  };

  const handleSave = async (event) => {
    event.preventDefault();

    if (!validateCurrentStep()) {
      setFormMessage('Please complete all required fields on this step.');
      return;
    }

    await saveRegistration(formData, currentUser);
    setFormMessage('Your volunteer profile has been saved successfully.');
  };

  const moveStep = (nextStep) => {
    if (nextStep === 2 && !validateStep(1)) {
      setFormMessage('Please finish the contact information before continuing.');
      return;
    }

    setFormMessage('');
    setActiveStep(nextStep);
  };

  const handleNextStep = () => {
    moveStep(2);
  };

  const handleLogout = async () => {
    await logoutUser();
    setCurrentUser(null);
    setMode('login');
    setAuthError('');
    setFormMessage('');
    setActiveStep(1);
  };

  const filteredRegistrations = registrations.filter((registration) => {
    const search = adminSearch.trim().toLowerCase();
    if (!search) {
      return true;
    }

    return [
      registration.name,
      registration.email,
      registration.location,
      registration.languages,
    ]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(search));
  });

  const sortedRegistrations = [...filteredRegistrations].sort((left, right) => {
    const leftTime = left.updatedAt ? new Date(left.updatedAt).getTime() : 0;
    const rightTime = right.updatedAt ? new Date(right.updatedAt).getTime() : 0;
    return rightTime - leftTime;
  });

  const weekdayCounts = availabilityOptions.map((day) => ({
    day,
    count: registrations.filter((entry) => entry.availability?.includes(day)).length,
  }));

  const topDay =
    weekdayCounts.slice().sort((left, right) => right.count - left.count)[0] ??
    { day: 'N/A', count: 0 };

  const uniqueLocations = new Set(
    registrations.map((entry) => entry.location).filter(Boolean),
  ).size;

  const uniqueLanguages = new Set(
    registrations
      .flatMap((entry) => (entry.languages ? entry.languages.split(',') : []))
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  ).size;
  const latestRegistration = sortedRegistrations[0] ?? registrations[0] ?? null;
  const selectedRegistration =
    sortedRegistrations.find((registration) => registration.userId === selectedRegistrationId) ??
    latestRegistration;
  const completedProfiles = registrations.filter(
    (entry) => entry.location && entry.languages && entry.availability?.length,
  ).length;
  const completionPercent = registrations.length
    ? Math.round((completedProfiles / registrations.length) * 100)
    : 0;

  useEffect(() => {
    if (!selectedRegistrationId && latestRegistration?.userId) {
      setSelectedRegistrationId(latestRegistration.userId);
      return;
    }

    if (
      selectedRegistrationId &&
      !sortedRegistrations.some((registration) => registration.userId === selectedRegistrationId)
    ) {
      setSelectedRegistrationId(latestRegistration?.userId ?? '');
    }
  }, [latestRegistration, selectedRegistrationId, sortedRegistrations]);

  if (!currentUser) {
    return (
      <div className={`app-shell auth-shell auth-theme-${authTheme}`}>
        <main className="auth-layout">
          <section className="brand-panel" aria-label="Teach For India introduction">
            <div className="auth-brand-lockup">
              <div className="brand-dot" />
              <span>Teach For India</span>
            </div>

            <div className="brand-copy">
              <h1>{mode === 'signup' ? 'Get Started with Us' : 'Welcome Back'}</h1>
              <p>
                {mode === 'signup'
                  ? 'Complete these easy steps to register your volunteer account.'
                  : 'Log in to continue your volunteer application and dashboard.'}
              </p>
            </div>

            <div className="auth-step-list" aria-label="Volunteer onboarding steps">
              <article className="auth-step-item active">
                <span>1</span>
                <p>{mode === 'signup' ? 'Sign up your account' : 'Log in to your account'}</p>
              </article>
              <article className="auth-step-item">
                <span>2</span>
                <p>Set up your volunteer details</p>
              </article>
              <article className="auth-step-item">
                <span>3</span>
                <p>Set up your profile</p>
              </article>
            </div>
          </section>

          <section className="auth-card-section">
            <div className="auth-card">
              <div className="auth-card-topbar">
                <div className="auth-topbar-controls">
                  <button
                    type="button"
                    className={`admin-entry-button ${authEntry === 'admin' ? 'active' : ''}`}
                    onClick={() => {
                      setAuthEntry((previous) =>
                        previous === 'admin' ? 'volunteer' : 'admin',
                      );
                      setMode('login');
                      setAuthError('');
                      setAuthForm((previous) => ({
                        ...previous,
                        email:
                          authEntry === 'admin' ? '' : adminCredentials.email,
                        password:
                          authEntry === 'admin' ? '' : adminCredentials.password,
                      }));
                    }}
                  >
                    Admin
                  </button>
                  <button
                    type="button"
                    className="theme-toggle"
                    onClick={() =>
                      setAuthTheme((previous) => (previous === 'dark' ? 'light' : 'dark'))
                    }
                  >
                    <span className="theme-toggle-track">
                      <span className="theme-toggle-thumb" />
                    </span>
                    {authTheme === 'dark' ? 'Light mode' : 'Dark mode'}
                  </button>
                </div>
              </div>

              <div className="auth-copy">
                <h2>
                  {authEntry === 'admin'
                    ? 'Admin Access'
                    : mode === 'signup'
                      ? 'Sign Up Account'
                      : 'Log In Account'}
                </h2>
                <p>
                  {authEntry === 'admin'
                    ? 'Use administrator credentials to review registered volunteers.'
                    : mode === 'signup'
                    ? 'Enter your personal data to create your account.'
                    : 'Enter your email and password to access your account.'}
                </p>
              </div>

              {authEntry !== 'admin' ? (
                <>
                  <div className="social-row" aria-label="Social login options">
                    <button
                      type="button"
                      className="social-button"
                      onClick={handleGoogleSignIn}
                      disabled={googleLoading}
                    >
                      <span className="social-mark google">G</span>
                      {googleLoading ? 'Signing in…' : 'Google'}
                    </button>
                  </div>

                  <div className="auth-divider" aria-hidden="true">
                    <span>Or</span>
                  </div>
                </>
              ) : null}

              <form className="auth-form" onSubmit={handleAuthSubmit}>
                {mode === 'signup' && authEntry !== 'admin' && (
                  <div className="name-row">
                    <label>
                      First Name
                      <input
                        type="text"
                        name="firstName"
                        value={authForm.firstName}
                        onChange={handleAuthInputChange}
                        placeholder="eg. John"
                        required
                      />
                    </label>
                    <label>
                      Last Name
                      <input
                        type="text"
                        name="lastName"
                        value={authForm.lastName}
                        onChange={handleAuthInputChange}
                        placeholder="eg. Francis"
                        required
                      />
                    </label>
                  </div>
                )}

                <label>
                  Email
                  <input
                    type="email"
                    name="email"
                    value={authForm.email}
                    onChange={handleAuthInputChange}
                    placeholder="eg. johnfrans@gmail.com"
                    required
                  />
                </label>

                <label>
                  Password
                  <div className="password-field">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      value={authForm.password}
                      onChange={handleAuthInputChange}
                      placeholder="Enter your password"
                      minLength="8"
                      required
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPassword((previous) => !previous)}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
                <p className="helper-copy">Must be at least 8 characters.</p>

                {authError && <p className="inline-feedback error">{authError}</p>}
                {storageError && <p className="inline-feedback error">{storageError}</p>}

                <button type="submit" className="primary-button">
                  {authEntry === 'admin'
                    ? 'Open Admin Dashboard'
                    : mode === 'signup'
                      ? 'Sign Up'
                      : 'Log In'}
                </button>
              </form>

              {authEntry !== 'admin' ? (
                <p className="auth-switch-copy">
                  {mode === 'signup' ? 'Already have an account?' : 'Do not have an account?'}{' '}
                  <button
                    type="button"
                    className="auth-inline-button"
                    onClick={() => {
                      setMode(mode === 'signup' ? 'login' : 'signup');
                      setAuthError('');
                      setShowPassword(false);
                    }}
                  >
                    {mode === 'signup' ? 'Log in' : 'Sign up'}
                  </button>
                </p>
              ) : null}

              <div className="admin-note">
                <p>{authEntry === 'admin' ? 'Admin access' : 'Admin demo'}</p>
                <span>{adminCredentials.email}</span>
                <span>{adminCredentials.password}</span>
                <span className="persistence-note">
                  Persistence mode: {persistenceMode === 'firebase' ? 'Firebase live' : 'Setup required'}
                </span>
              </div>
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (currentUser.role === 'admin') {
    return (
      <div className={`app-shell dashboard-shell admin-shell admin-theme-${adminTheme}`}>
        <aside className="admin-sidebar">
          <div className="admin-sidebar-brand">
            <div className="admin-sidebar-brand-top">
              <div className="admin-sidebar-logo">TFI</div>
              <div>
                <strong>Teach For India</strong>
                <span>Volunteer admin</span>
              </div>
            </div>
          </div>

          <label className="admin-sidebar-search">
            <span className="admin-search-icon">S</span>
            <input
              type="search"
              value={adminSearch}
              onChange={(event) => setAdminSearch(event.target.value)}
              placeholder="Search volunteers"
            />
            <small>{sortedRegistrations.length}</small>
          </label>

          <nav className="admin-menu">
            <button type="button" className="active"><span>01</span>Dashboard</button>
            <button type="button"><span>02</span>Candidates</button>
            <button type="button"><span>03</span>Availability</button>
            <button type="button"><span>04</span>Locations</button>
            <button type="button"><span>05</span>Reports</button>
          </nav>

          <div className="admin-sidebar-group">
            <p className="admin-sidebar-group-title">Admin tools</p>
            <div className="admin-mini-list">
              <div className="admin-mini-row">
                <span>Candidate records</span>
                <small>{registrations.length}</small>
              </div>
              <div className="admin-mini-row">
                <span>Persistence mode</span>
                <small>{persistenceMode === 'firebase' ? 'Firebase live' : 'Setup required'}</small>
              </div>
              <div className="admin-mini-row">
                <span>Latest update</span>
                <small>{latestRegistration ? 'Live' : 'Waiting'}</small>
              </div>
            </div>
          </div>

          <div className="admin-sidebar-group">
            <p className="admin-sidebar-group-title">Pinned volunteers</p>
            <div className="admin-mini-list admin-quick-links">
              {sortedRegistrations.slice(0, 3).map((registration) => (
                <button
                  type="button"
                  key={`${registration.userId}-sidebar`}
                  className={`admin-mini-row admin-mini-button ${
                    selectedRegistration?.userId === registration.userId ? 'active' : ''
                  }`}
                  onClick={() => setSelectedRegistrationId(registration.userId)}
                >
                  <span>{registration.name}</span>
                  <small>{registration.location || 'Pending'}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="admin-sidebar-footer">
            <p>Admin access</p>
            <span>
              Review saved volunteer forms, track availability, and inspect candidate details.
            </span>
            <button type="button" className="admin-logout" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </aside>

        <main className="admin-main">
          <header className="admin-topbar">
            <div>
              <h1>Volunteer Dashboard</h1>
              <p className="admin-subtitle">
                Monitor registrations, review candidate profiles, and manage volunteer intake.
              </p>
            </div>
            <div className="admin-topbar-actions">
              <button
                type="button"
                className="admin-theme-toggle"
                onClick={() =>
                  setAdminTheme((previous) => (previous === 'light' ? 'dark' : 'light'))
                }
              >
                {adminTheme === 'light' ? 'Dark mode' : 'Light mode'}
              </button>
              <button type="button" className="ghost-button admin-refresh-button" disabled>
                Live sync
              </button>
              <div className="admin-profile-card">
                <div className="admin-profile-avatar">A</div>
                <div>
                  <strong>Admin User</strong>
                  <span>{adminCredentials.email}</span>
                </div>
              </div>
            </div>
          </header>

          {!isLiveStorageEnabled ? (
            <div className="inline-feedback error">
              Firebase is not configured. Add your `VITE_FIREBASE_*` keys in `.env.local` to use live admin data.
            </div>
          ) : null}

          <section className="admin-section">
            <div className="admin-section-heading">
              <div>
                <h2>Registration overview</h2>
                <p>All insights below are generated from submitted volunteer registration forms.</p>
              </div>
            </div>

            <div className="admin-analytics-grid">
              <article className="analytics-card">
                <div className="analytics-header">
                  <span>Total volunteers</span>
                  <strong>{registrations.length}</strong>
                </div>
                <div className="analytics-visual area-visual">
                  <span />
                </div>
                <p>{filteredRegistrations.length} visible in current search</p>
              </article>

              <article className="analytics-card">
                <div className="analytics-header">
                  <span>Cities covered</span>
                  <strong>{uniqueLocations}</strong>
                </div>
                <div className="analytics-visual bar-visual">
                  <span />
                  <span />
                  <span />
                </div>
                <p>Volunteer spread across preferred locations</p>
              </article>

              <article className="analytics-card">
                <div className="analytics-header">
                  <span>Languages tracked</span>
                  <strong>{uniqueLanguages}</strong>
                </div>
                <div className="analytics-visual line-visual">
                  <span />
                </div>
                <p>Distinct spoken languages submitted by volunteers</p>
              </article>

              <article className="analytics-card">
                <div className="analytics-header">
                  <span>Top availability</span>
                  <strong>{topDay.day}</strong>
                </div>
                <div className="analytics-visual curve-visual">
                  <span>{topDay.count}</span>
                </div>
                <p>{topDay.count} volunteers selected this day</p>
              </article>
            </div>
          </section>

          <section className="admin-section">
            <div>
              <h2>Candidate management</h2>
              <p>Inspect every registration and review submitted volunteer information.</p>
            </div>

            <div className="admin-insights-grid">
              <section className="admin-panel">
                <h3>Candidate list</h3>
                <p>Click a volunteer to open their full registration profile.</p>
                {filteredRegistrations.length === 0 ? (
                  <div className="empty-state">
                    <h3>No registrations yet</h3>
                    <p>Volunteer entries will appear here after a user saves the form.</p>
                  </div>
                ) : (
                  <div className="admin-candidate-list">
                    {sortedRegistrations.map((registration) => (
                      <button
                        type="button"
                        className={`admin-candidate-row ${
                          selectedRegistration?.userId === registration.userId ? 'active' : ''
                        }`}
                        key={registration.userId}
                        onClick={() => setSelectedRegistrationId(registration.userId)}
                      >
                        <div className="candidate-avatar">
                          {registration.name?.slice(0, 1)?.toUpperCase() ?? 'V'}
                        </div>
                        <div className="candidate-primary">
                          <strong>{registration.name}</strong>
                          <span>{registration.email}</span>
                        </div>
                        <div className="candidate-meta">
                          <span>{registration.location || 'No location'}</span>
                          <span>{registration.contactNumber || 'No phone'}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="admin-panel">
                <h3>Candidate details</h3>
                <p>Selected volunteer profile with registration details.</p>
                {selectedRegistration ? (
                  <article className="admin-detail-card">
                    <div className="record-heading">
                      <h3>{selectedRegistration.name}</h3>
                      <span>
                        {selectedRegistration.updatedAt
                          ? new Date(selectedRegistration.updatedAt).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })
                          : 'Saved'}
                      </span>
                    </div>
                    <p><strong>Email:</strong> {selectedRegistration.email}</p>
                    <p><strong>Contact:</strong> {selectedRegistration.contactNumber}</p>
                    <p><strong>Date of birth:</strong> {selectedRegistration.dateOfBirth}</p>
                    <p><strong>Location:</strong> {selectedRegistration.location || 'Not provided'}</p>
                    <p><strong>Languages:</strong> {selectedRegistration.languages || 'Not provided'}</p>
                    <p><strong>Availability:</strong> {(selectedRegistration.availability || []).join(', ') || 'Not selected'}</p>
                  </article>
                ) : (
                  <div className="empty-state">
                    <h3>No registrations yet</h3>
                    <p>Submit one volunteer profile to populate the detail view.</p>
                  </div>
                )}
              </section>

              <section className="admin-panel small-panel">
                <h3>Step 2 completion</h3>
                <strong>{completionPercent}%</strong>
                <p>Volunteers who completed location, language, and availability.</p>
                <div className="analytics-visual progress-visual">
                  <span style={{ width: `${completionPercent}%` }} />
                </div>
              </section>

              <section className="admin-panel small-panel">
                <h3>Availability snapshot</h3>
                <strong>{topDay.day}</strong>
                <p>Most selected day based on submitted volunteer availability.</p>
                <div className="map-visual">
                  <span />
                  <span />
                  <span />
                </div>
              </section>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell volunteer-shell">
      <header className="volunteer-page-topbar">
        <button type="button" className="volunteer-back-link" onClick={handleLogout}>
          <span aria-hidden="true">&larr;</span>
          Back
        </button>
        <div className="volunteer-brand">
          <div className="volunteer-brand-mark" />
          <span>Teach For India</span>
        </div>
        <div className="volunteer-user-actions">
          <span>{currentUser.email}</span>
        </div>
      </header>

      <main className="volunteer-card">
        <aside className="volunteer-sidebar">
          {stepMeta.map((step) => (
            <button
              type="button"
              key={step.id}
              className={`volunteer-step-link ${activeStep === step.id ? 'active' : ''}`}
              onClick={() => moveStep(step.id)}
            >
              <span className="volunteer-step-number">{step.id}</span>
              <span>{step.title}</span>
            </button>
          ))}
        </aside>

        <section className="volunteer-form-panel">
          <nav className="volunteer-top-nav" aria-label="Step navigation">
            {stepMeta.map((step, index) => (
              <div className="volunteer-top-nav-item" key={step.id}>
                <button
                  type="button"
                  className={activeStep === step.id ? 'active' : ''}
                  onClick={() => moveStep(step.id)}
                  aria-current={activeStep === step.id ? 'step' : undefined}
                >
                  {step.title}
                </button>
                {index < stepMeta.length - 1 ? <span className="volunteer-nav-arrow">-&gt;</span> : null}
              </div>
            ))}
          </nav>

          <div className="volunteer-form-header">
            <h1>
              {activeStep === 1
                ? 'Verify your contact information'
                : 'Add your other details'}
            </h1>
            <p>{stepMeta.find((step) => step.id === activeStep)?.description}</p>
          </div>

          <form onSubmit={handleSave} className="volunteer-form">
            {activeStep === 1 ? (
              <div className="volunteer-fields">
                <label>
                  Name
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleFormChange}
                    placeholder="Enter your full name"
                    required
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleFormChange}
                    placeholder="example@email.com"
                    required
                  />
                </label>
                <label>
                  Phone
                  <input
                    type="tel"
                    name="contactNumber"
                    value={formData.contactNumber}
                    onChange={handleFormChange}
                    placeholder="+91 98765 43210"
                    required
                  />
                </label>
                <label>
                  DOB
                  <input
                    type="date"
                    name="dateOfBirth"
                    value={formData.dateOfBirth}
                    onChange={handleFormChange}
                    required
                  />
                </label>
              </div>
            ) : (
              <div className="volunteer-fields">
                <label>
                  Location
                  <input
                    type="text"
                    name="location"
                    value={formData.location}
                    onChange={handleFormChange}
                    placeholder="City, State"
                    required
                  />
                </label>
                <label>
                  Languages
                  <input
                    type="text"
                    name="languages"
                    value={formData.languages}
                    onChange={handleFormChange}
                    placeholder="English, Hindi, Marathi"
                    required
                  />
                </label>
                <fieldset className="availability-field volunteer-availability">
                  <legend>Availability</legend>
                  <div className="volunteer-checkbox-grid">
                    {availabilityOptions.map((day) => (
                      <label className="volunteer-checkbox" key={day}>
                        <input
                          type="checkbox"
                          checked={formData.availability.includes(day)}
                          onChange={() => handleAvailabilityToggle(day)}
                        />
                        <span>{day.slice(0, 3)}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
            )}

            {formMessage && <p className="inline-feedback volunteer-feedback">{formMessage}</p>}

            <div className="volunteer-actions">
              {activeStep === 1 ? (
                <button
                  type="button"
                  className="primary-button volunteer-next-button"
                  onClick={handleNextStep}
                >
                  Next -&gt;
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="ghost-button volunteer-back-button"
                    onClick={() => moveStep(1)}
                  >
                    &lt;- Back
                  </button>
                  <button type="submit" className="primary-button volunteer-next-button">
                    Submit
                  </button>
                </>
              )}
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}

export default App;
