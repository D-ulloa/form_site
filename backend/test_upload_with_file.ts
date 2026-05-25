import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createPropertySubmission } from './src/services/createPropertySubmission.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, './.env') });

// A valid, minimal 1x1 pixel transparent PNG image base64 buffer
const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const mockFile: Express.Multer.File = {
  fieldname: 'files',
  originalname: 'test_empty_picture.png',
  encoding: '7bit',
  mimetype: 'image/png',
  buffer: Buffer.from(TINY_PNG_BASE64, 'base64'),
  size: 68,
  // Remaining fields required by Express.Multer.File type
  destination: '',
  filename: '',
  path: '',
  stream: null as any,
};

const payload = {
  agent_user_id: 'real-file-upload-test-user',
  agent_name: 'Real File Upload Tester',
  agent_email: 'real.file.tester@example.com',
  cover_file_name: 'test_empty_picture.png',
  'Tipo de Inmueble': 'Departamento',
  'Operación': 'Alquiler',
  Dormitorios: 1,
  Ambientes: 2,
  Precio: 50000,
  Expensas: 5000,
  Moneda: 'Pesos',
  'Apto crédito': false,
  Escritura: false,
  'Unidad en Pozo': false,
  Cartel: false,
  Propietario: 'Prop-FILE-TEST',
  'Asesor comercial': 'Asesor-File-Test',
  Productor: 'Productor-File-Test',
  Sucursal: 'Sucursal-File-Test',
  Pais: 'Argentina',
  Provincia: 'Buenos Aires',
  Localidad: 'La Plata',
  Barrio: 'Centro',
  Calle: 'Calle 50',
  'Número': '789',
  'Piso | Mza | Denominacion': 'Piso 3',
  'Depto | Lote |': 'Depto B',
  Referencia: 'Cerca de plaza principal',
  'Baños': 1,
  Plantas: 1,
  Antiguedad: 2,
  'Estado general': 'Excelente',
  'Apto para': 'Estudiantes',
  Estilo: 'Moderno',
  Orientacion: 'Norte',
  'Sup Terreno | Hectáreas': '40',
  'Sup Terraza': '5',
  'Sup Balcon': '3',
  'Otras superficies': '0',
  'Metros cubiertos': '38',
  'Sup de Jardin': '0',
  'Mts de Frente': '6',
  'Mts de Fondo': '20',
  Llaves: '1',
  'Descrp. de dormitorio 1': 'Dormitorio luminoso con placard',
  'Descrp. de dormitorio 2': '',
  'Descrp. de dormitorio 3': '',
  'Descrp. de dormitorio 4': '',
  'Descrp. de dormitorio 5': '',
  Garage: false,
  'Living Comedor': true,
  'Cocina Comedor': false,
  'Comedor diario': false,
  'Ante Cocina': false,
  Dependencias: false,
  Patio: false,
  Pileta: false,
  Hogar: false,
  'Area de parrilla': false,
  Quincho: false,
  'Suite Principal': false,
  Vestidor: false,
  'Sala estar': false,
  Estudio: false,
  Escritorio: false,
  Lavadero: true,
  'Hall acceso': false,
  'Hall distrib.': false,
  'Gas Natural': true,
  'Gas en tubos': false,
  Cloacas: true,
  Sotano: false,
  Bodega: false,
  Despensa: false,
  'Play room': false,
  Bar: false,
  'Jardín inv.': false,
  'Cámara Sept.': false,
  'Galería': false,
  Altillo: false,
  Terraza: false,
  'Aire A.Central': false,
  'Aire A. Ind.': true,
  Calefactores: true,
  'Calef. central': false,
  'Tiro balanc.': false,
  'Calefón': true,
  Estractor: false,
  Termotanque: false,
  Alarma: false,
  'Agua cte.': true,
  Toillette: false,
  Hidromasaje: false,
  Jacuzzi: false,
  Balcon: true,
  Observaciones: 'Prueba de envío real con archivo de imagen de 1x1 pixel desde backend.',
  'Notas Privadas': 'Test de archivo',
  Titulo: 'Prueba de Departamento con Archivo Real',
  Detalle: 'Prueba de envío de archivo.',
};

(async () => {
  console.log('🚀 Starting Google Drive file upload test...');
  console.log(`📂 Mock file: "${mockFile.originalname}" (${mockFile.size} bytes)`);

  try {
    const result = await createPropertySubmission(payload as any, [mockFile]);
    
    console.log('\n✅ SUBMISSION RESULT:');
    console.log(JSON.stringify(result, null, 2));

    if (result.outcome === 'success') {
      console.log('\n🎉 SUCCESS: Files successfully uploaded to Google Drive!');
      console.log(`🔗 Folder Link: ${result.drive_folder_url}`);
    } else {
      console.warn(`\n⚠️ OUTCOME: ${result.outcome}`);
      if (result.error) {
        console.error(`❌ Error details: ${result.error}`);
      }
    }
  } catch (error) {
    console.error('\n❌ CRITICAL ERROR during execution:', error);
    process.exit(1);
  }
})();
