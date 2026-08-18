import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ActionSelectionPage } from './pages/ActionSelectionPage';
import { NewPropertyPage } from './pages/NewPropertyPage';
import { SubmissionSuccessPage } from './pages/SubmissionSuccessPage';
import { ContractFormPage } from './pages/ContractFormPage';
import { ContractAdminPage } from './pages/ContractAdminPage';
import { AuthPage } from './pages/AuthPage';
import { GoogleAuthCallbackPage } from './pages/GoogleAuthCallbackPage';
import { InvitationAcceptPage } from './pages/InvitationAcceptPage';
import { OrganizationGovernancePage } from './pages/OrganizationGovernancePage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ActionSelectionPage />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/auth/callback" element={<GoogleAuthCallbackPage />} />
        <Route path="/invitations/accept" element={<InvitationAcceptPage />} />
        <Route path="/t/:organizationSlug/settings/organization" element={<OrganizationGovernancePage section="organization" />} />
        <Route path="/t/:organizationSlug/settings/members" element={<OrganizationGovernancePage section="members" />} />
        <Route path="/t/:organizationSlug/settings/invitations" element={<OrganizationGovernancePage section="invitations" />} />
        <Route path="/t/:organizationSlug/settings/lifecycle" element={<OrganizationGovernancePage section="lifecycle" />} />
        <Route path="/properties/new" element={<NewPropertyPage />} />
        <Route path="/properties/success/:submissionId" element={<SubmissionSuccessPage />} />
        <Route path="/contracts/admin" element={<ContractAdminPage />} />
        <Route path="/contracts/admin/:entryId" element={<ContractAdminPage />} />
        <Route path="/contracts/:entryId/:role" element={<ContractFormPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
