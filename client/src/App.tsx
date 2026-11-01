import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { I18nProvider } from '@heroui/react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ProtectedRoute from './components/ProtectedRoute';
import JobCalendar from './components/JobCalendar';

export default function App() {
  return (
    <I18nProvider locale="en-IN">
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }>
          <Route path="/return" element={
            <JobCalendar key="return" jobType="return" title="Return" />} />
          <Route path="/cancel" element={
            <JobCalendar key="cancel" jobType="cancel" title="Cancel" />} />
        </Route>
        <Route path="*" element={<Navigate to="/return" replace />} />
      </Routes>
    </BrowserRouter>
    </I18nProvider>
  );
}
