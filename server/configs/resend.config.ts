import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendVerificationEmail = async (
  to: string,
  code: string
) => {
  try {
   const info = await resend.emails.send({
      from: '"Messanger-Denis" <onboarding@resend.dev>',
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

    console.log('📧 Письмо отправлено:', info);

  } catch (error) {
    console.error('Ошибка отправки:', error);
  }
};