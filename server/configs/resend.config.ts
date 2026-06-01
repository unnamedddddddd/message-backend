import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendVerificationEmail = async (
  to: string,
  code: string
) => {
  try {
    const info = await resend.emails.send({
      from: '"Droksid" <support@messanger.dpdns.org>',
      to,
      subject: 'Код подтверждения Messanger',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
          <h2>Подтверждение регистрации</h2>

          <p>Здравствуйте!</p>

          <p>Вы запросили код подтверждения для аккаунта в Messanger.</p>

          <p>Ваш код:</p>

          <h1>${code}</h1>

          <p>Код действует 10 минут.</p>

          <p>Если вы не запрашивали этот код, просто проигнорируйте это письмо.</p>

          <hr />

          <p>Droksid Team</p>
          <p>support@messanger.dpdns.org</p>
        </div>
      ` 
    });

    console.log('📧 Письмо отправлено:', info.data, to);

  } catch (error) {
    console.error('Ошибка отправки:', error);
  }
};