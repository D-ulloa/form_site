import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ActionSelectionPage } from './pages/ActionSelectionPage.tsx';
import { NewPropertyPage } from './pages/NewPropertyPage.tsx';
import { SubmissionSuccessPage } from './pages/SubmissionSuccessPage.tsx';
import { ContractFormPage } from './pages/ContractFormPage.tsx';
import { ContractAdminPage } from './pages/ContractAdminPage.tsx';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ActionSelectionPage />} />
        <Route path="/properties/new" element={<NewPropertyPage />} />
        <Route path="/properties/success/:submissionId" element={<SubmissionSuccessPage />} />
        <Route path="/contracts/admin" element={<ContractAdminPage />} />
        <Route path="/contracts/:entryId/:role" element={<ContractFormPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
