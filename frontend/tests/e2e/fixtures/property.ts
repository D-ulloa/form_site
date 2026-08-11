export const mockAgent = {
  agent_user_id: 'agent-e2e-001',
  agent_name: 'Ana Pruebas',
  agent_email: 'ana.pruebas@example.com',
};

export const mockProperty = {
  type: 'Casa',
  operation: 'Venta',
  price: '185000',
  expenses: '35000',
  currency: 'Dolares',
  owner: 'María González',
  adviser: 'Ana Pruebas',
  branch: 'Mar del Plata Centro',
  contractType: 'A convenir.',
  province: 'Buenos Aires',
  locality: 'Mar del Plata',
  neighborhood: 'Los Troncos',
  street: 'Olavarría',
  streetNumber: '2847',
  bedrooms: '3',
  rooms: '5',
  bathrooms: '2',
  floors: '2',
  age: '12',
  coveredMeters: '180',
  title: 'Casa luminosa con jardín y pileta',
  observations: 'Propiedad de prueba E2E. No corresponde a una publicación real.',
  detail: 'Living comedor, cocina equipada, tres dormitorios y jardín.',
  privateNotes: 'Fixture automatizado: no contactar al propietario.',
  features: ['Apto crédito', 'Escritura', 'Garage', 'Living Comedor', 'Pileta'],
};

export const mockMedia = {
  name: 'casa-frente-e2e.jpg',
  mimeType: 'image/jpeg',
  body: 'mock-jpeg-content-for-property-e2e',
  uploadSessionId: 'upload-session-e2e-001',
  uploadUrl: 'https://storage.mock/property-media/properties/casa-frente-e2e.jpg?token=e2e',
  publicPath: '/storage/v1/object/property-media/properties/casa-frente-e2e.jpg',
  storagePath: 'properties/casa-frente-e2e.jpg',
  storageBucket: 'property-media',
};

export const mockSubmission = {
  outcome: 'success',
  property_id: 'PROP-2026-E2E00001',
  submission_id: 'SUB-2026-08-04-E2E00001',
  drive_folder_url: 'https://drive.google.com/drive/folders/mock-e2e-folder',
  drive_folder_name: 'Mar del Plata - Casa - Olavarría 2847',
  upload_strategy: 'supabase',
  supabase_object_count: 1,
  upload_byte_total: mockMedia.body.length,
  steps: {
    drive_folder: 'ok',
    file_upload: 'ok',
    drive_upload: 'skipped',
    sheets: 'ok',
    make: 'ok',
  },
};
