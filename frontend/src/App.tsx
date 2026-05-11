import { BrowserRouter, Routes, Route } from 'react-router-dom';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<div className="p-8"><h1>Action Selection Page</h1></div>} />
        <Route path="/properties/new" element={<div className="p-8"><h1>New Property Form</h1></div>} />
        <Route path="/properties/success/:submissionId" element={<div className="p-8"><h1>Success Page</h1></div>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
