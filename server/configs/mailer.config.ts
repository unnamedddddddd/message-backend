import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import dns from 'dns';

dns.setDefaultResultOrder('ipv4first');
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

if (!process.env.MAILER_PASSWORD) {
  console.error('❌ MAILER_PASSWORD is missing!');
}

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  requireTLS: true,
  family: 4,
  auth: {
    user: 'deniskamaldinov85@gmail.com',
    pass: process.env.MAILER_PASSWORD
  }
} as SMTPTransport.Options);

transporter.verify((error, success) => {
  if (error) {
    console.error('SMTP VERIFY FAILED:', error);
  } else {
    console.log('SMTP READY');
  }
});

export const sendVerificationEmail = async (to: string, code: string) => {
  try {
    const info = await transporter.sendMail({
      from: '"Messanger-Denis" <deniskamaldinov85@gmail.com>',
      to,
      subject: 'Код подтверждения Messanger',
      html: `
        <div style="font-family: sans-serif; text-align: center;">
          <h2>Добро пожаловать в Messanger-Denis</h2>
          <p>Твой код активации:</p>
          <h1 style="color: #898b8f; letter-spacing: 5px;">${code}</h1>
          <p>Код действует 10 минут.</p>
        </div>`
    });

    console.log('📧 Письмо отправлено:', info.messageId);

  } catch (error) {
    console.error('❌ Ошибка Nodemailer:', error);
  }
};