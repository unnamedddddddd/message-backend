import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const userAvatarStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'users-avatars',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
  } as any,
});

const serverAvatarStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'servers-avatars',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
  } as any,
});

export const uploadUser = multer({ storage: userAvatarStorage });
export const uploadServer = multer({ storage: serverAvatarStorage });