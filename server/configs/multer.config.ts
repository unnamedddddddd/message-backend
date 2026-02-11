import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadDirUser = 'uploads/UsersAvatars/';
if (!fs.existsSync(uploadDirUser)) {
  fs.mkdirSync(uploadDirUser, {recursive: true});
}

const uploadDirServer = 'uploads/ServersAvatars/';
if (!fs.existsSync(uploadDirServer)) {
  fs.mkdirSync(uploadDirServer, {recursive: true});
}

// ХРАНИЛИЩЕ 
const storageUser = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDirUser);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
})

const storageServer = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDirServer);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
})

// ФИЛЬТР ФАЙЛОВ
const fileFilter = (req: any, file: any, cb: any) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Разрешены только изображения'), false);
  }
}
// САМ КОНФИГ multer'a
export const uploadUser = multer({
  storage: storageUser,
  fileFilter: fileFilter,
  limits: {fileSize: 5 * 1024 * 1024}
})

export const uploadServer = multer({
  storage: storageServer,
  fileFilter: fileFilter,
  limits: {fileSize: 5 * 1024 * 1024}
})