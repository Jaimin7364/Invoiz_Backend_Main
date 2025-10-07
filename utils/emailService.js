const nodemailer = require('nodemailer');

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

// Generate OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP Email
const sendOTPEmail = async (email, otp, fullName) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: `"Invoiz App" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Verify Your Email - Invoiz App',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #4CAF50; color: white; padding: 20px; text-align: center;">
            <h1>Welcome to Invoiz!</h1>
          </div>
          
          <div style="padding: 20px; background-color: #f9f9f9;">
            <h2>Hello ${fullName},</h2>
            <p>Thank you for registering with Invoiz! To complete your account setup, please verify your email address.</p>
            
            <div style="background-color: white; border: 2px solid #4CAF50; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
              <h3 style="color: #4CAF50; margin: 0;">Your Verification Code</h3>
              <div style="font-size: 32px; font-weight: bold; color: #333; margin: 10px 0; letter-spacing: 5px;">
                ${otp}
              </div>
              <p style="color: #666; margin: 0;">This code will expire in ${process.env.OTP_EXPIRY_MINUTES || 10} minutes</p>
            </div>
            
            <p style="color: #666;">
              If you didn't create an account with Invoiz, please ignore this email.
            </p>
            
            <div style="border-top: 1px solid #ddd; padding-top: 20px; margin-top: 30px; color: #999; font-size: 12px;">
              <p>This is an automated email. Please do not reply to this message.</p>
              <p>&copy; 2024 Invoiz App. All rights reserved.</p>
            </div>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('✅ OTP email sent successfully:', result.messageId);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('❌ Error sending OTP email:', error);
    throw new Error('Failed to send OTP email');
  }
};

// Send Welcome Email
const sendWelcomeEmail = async (email, fullName, businessName) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: `"Invoiz App" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Welcome to Invoiz - Your Account is Ready!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #4CAF50; color: white; padding: 20px; text-align: center;">
            <h1>Welcome to Invoiz!</h1>
          </div>
          
          <div style="padding: 20px; background-color: #f9f9f9;">
            <h2>Congratulations ${fullName}! 🎉</h2>
            <p>Your Invoiz account for <strong>${businessName}</strong> has been successfully created and verified!</p>
            
            <div style="background-color: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <h3 style="color: #4CAF50;">What's Next?</h3>
              <ul style="color: #333;">
                <li>Complete your business profile</li>
                <li>Choose a subscription plan that suits your needs</li>
                <li>Start managing your invoices efficiently</li>
                <li>Explore all the features Invoiz has to offer</li>
              </ul>
            </div>
            
            <div style="background-color: #e8f5e8; border-radius: 8px; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; color: #2e7d32;">
                <strong>💡 Pro Tip:</strong> Don't forget to set up your subscription to unlock all premium features!
              </p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}" 
                 style="background-color: #4CAF50; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                Open Invoiz App
              </a>
            </div>
            
            <div style="border-top: 1px solid #ddd; padding-top: 20px; margin-top: 30px; color: #999; font-size: 12px;">
              <p>Need help? Contact our support team at support@invoiz.app</p>
              <p>&copy; 2024 Invoiz App. All rights reserved.</p>
            </div>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Welcome email sent successfully:', result.messageId);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('❌ Error sending welcome email:', error);
    // Don't throw error for welcome email as it's not critical
    return { success: false, error: error.message };
  }
};

// Send Subscription Confirmation Email
const sendSubscriptionEmail = async (email, fullName, planName, amount, validUntil) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: `"Invoiz App" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Subscription Activated - Invoiz App',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #4CAF50; color: white; padding: 20px; text-align: center;">
            <h1>Subscription Activated! 🚀</h1>
          </div>
          
          <div style="padding: 20px; background-color: #f9f9f9;">
            <h2>Hello ${fullName},</h2>
            <p>Your subscription has been successfully activated. You now have full access to all Invoiz features!</p>
            
            <div style="background-color: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <h3 style="color: #4CAF50; margin-top: 0;">Subscription Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Plan:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${planName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Amount Paid:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;">₹${amount}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>Valid Until:</strong></td>
                  <td style="padding: 8px 0;">${new Date(validUntil).toLocaleDateString('en-IN')}</td>
                </tr>
              </table>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}" 
                 style="background-color: #4CAF50; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                Start Using Invoiz
              </a>
            </div>
            
            <div style="border-top: 1px solid #ddd; padding-top: 20px; margin-top: 30px; color: #999; font-size: 12px;">
              <p>Need help? Contact our support team at support@invoiz.app</p>
              <p>&copy; 2024 Invoiz App. All rights reserved.</p>
            </div>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Subscription email sent successfully:', result.messageId);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('❌ Error sending subscription email:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  generateOTP,
  sendOTPEmail,
  sendWelcomeEmail,
  sendSubscriptionEmail
};