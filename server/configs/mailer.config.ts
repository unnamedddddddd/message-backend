import nodemailer from 'nodemailer';

export const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'deniskamaldinov85@gmail.com',
    pass: 'iyvs ficj zbkn nhxt', // ПОМЕНЯТЬ ПАРОЛЬ И СДЕЛАТЬ proccess.env
  }
})

export const sendVerificationEmail  = async(to: string, code: string) => {
  try {
    await transporter.sendMail({
      from:  '"Messanger-Denis" deniskamaldinov85@gmail.com',
      to,
      subject: 'Код подтверждения Messanger',
      html: `
        <div style="font-family: sans-serif; text-align: center;">
          <h2>Добро пожаловать в Messanger-Denis</h2> 
          <p>Твой код активации:</p>
          <h1 style="color: #898b8f; letter-spacing: 5px;">${code}</h1>
          <p>Код действует 10 минут.</p>
        </div>`,
    });
    console.log('Письмо успешно отправлено на', to);
  } catch (error) {
    console.error('Ошибка Nodemailer:', error);
  }
}