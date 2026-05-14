import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '../context/ThemeContext';
import '../styles/App.css';

const SearchPage = lazy(() => import('../pages/Search/SearchPage'));
const MediaDetailsPage = lazy(() => import('../pages/MediaDetails/MediaDetailsPage'));
const LoginPage = lazy(() => import('../pages/Login/LoginPage'));
const ProfilePage = lazy(() => import('../pages/Profile/ProfilePage'));

function PrivateRoute({ children }) {
  const user = localStorage.getItem('user');
  return user ? children : <Navigate to="/login" replace />;
}

function App() {
  return (
    <ThemeProvider>
      <Router>
        <div className="App">
          <Suspense fallback={<div className="page-loading" />}>
          <Routes>
            {/* Default route redirects to search */}
            <Route path="/" element={<Navigate to="/search" replace />} />
            
            {/* Login page */}
            <Route path="/login" element={<LoginPage />} />
            
            {/* Search page - protected */}
            <Route path="/search" element={<PrivateRoute><SearchPage /></PrivateRoute>} />
            
            {/* Media details page - protected */}
            <Route path="/media/:type/:id" element={<PrivateRoute><MediaDetailsPage /></PrivateRoute>} />

            {/* Profile page - protected */}
            <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
            
            {/* Catch-all route */}
            <Route path="*" element={<Navigate to="/search" replace />} />
          </Routes>
          </Suspense>
        </div>
      </Router>
    </ThemeProvider>
  );
}

export default App;
