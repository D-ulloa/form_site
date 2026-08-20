import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
import { ActionSelectionPage } from './pages/ActionSelectionPage';
import { NewPropertyPage } from './pages/NewPropertyPage';
import { SubmissionSuccessPage } from './pages/SubmissionSuccessPage';
import { ContractFormPage } from './pages/ContractFormPage';
import { ContractAdminPage } from './pages/ContractAdminPage';
import { AuthPage } from './pages/AuthPage';
import { GoogleAuthCallbackPage } from './pages/GoogleAuthCallbackPage';
import { InvitationAcceptPage } from './pages/InvitationAcceptPage';
import { OrganizationGovernancePage } from './pages/OrganizationGovernancePage';
import { AuthenticationProvider } from './app/contexts/AuthenticationContext';
import { OrganizationRouteBoundary } from './app/contexts/OrganizationContext';

function App() {
  return (
    <BrowserRouter>
      <AuthenticationProvider><Routes>
        <Route path="/" element={<ActionSelectionPage />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/auth/callback" element={<GoogleAuthCallbackPage />} />
        <Route path="/invitations/accept" element={<InvitationAcceptPage />} />
        <Route path="/t/:organizationSlug" element={<OrganizationRouteBoundary />}>
          <Route index element={<ActionSelectionPage />} />
          <Route path="settings/organization" element={<OrganizationGovernancePage section="organization" />} />
          <Route path="settings/members" element={<OrganizationGovernancePage section="members" />} />
          <Route path="settings/invitations" element={<OrganizationGovernancePage section="invitations" />} />
          <Route path="settings/lifecycle" element={<OrganizationGovernancePage section="lifecycle" />} />
          <Route path="properties/new" element={<NewPropertyPage />} />
          <Route path="properties/success/:submissionId" element={<SubmissionSuccessPage />} />
          <Route path="contracts/admin" element={<ContractAdminPage />} />
          <Route path="contracts/admin/:entryId" element={<ContractAdminPage />} />
        </Route>
        <Route path="/properties/*" element={<Navigate to="/" replace />} />
        <Route path="/contracts/admin/*" element={<Navigate to="/" replace />} />
        <Route path="/contracts/:entryId/:role" element={<ContractFormPage />} />
      </Routes></AuthenticationProvider>
    </BrowserRouter>
  );
}

export default App;
