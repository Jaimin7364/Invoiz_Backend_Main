# Invoiz Backend API

A comprehensive Node.js backend API for the Invoiz business management application with authentication, business registration, and subscription management.

## Features

- 🔐 **User Authentication**: Registration, login, email OTP verification
- 🏢 **Business Management**: Business profile registration and management
- 💳 **Subscription System**: Razorpay integration with multiple plans
- 📧 **Email Service**: OTP verification, welcome emails, subscription confirmations
- 🛡️ **Security**: JWT authentication, rate limiting, input validation
- 🗄️ **Database**: MongoDB with Mongoose ODM

## Subscription Plans

| Plan | Price | Duration | Features |
|------|-------|----------|----------|
| Basic | ₹100 | 1 month | 50 invoices, basic templates, email support |
| Pro | ₹549 | 6 months | 500 invoices, premium features, priority support |
| Premium | ₹999 | 12 months | Unlimited invoices, advanced features, GST compliance |
| Enterprise | ₹2499 | 36 months | Everything + multi-location, API access, 24/7 support |

## Setup Instructions

### 1. Install Dependencies
```bash
cd server
npm install
```

### 2. Environment Configuration
Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Update the following variables:
- `MONGODB_URI`: Your MongoDB Atlas connection string
- `JWT_SECRET`: A strong secret key for JWT tokens
- `EMAIL_USER` & `EMAIL_PASS`: Gmail SMTP credentials
- `RAZORPAY_KEY_ID` & `RAZORPAY_KEY_SECRET`: Razorpay API keys

### 3. Initialize Database
```bash
# Initialize subscription plans
node scripts/initSubscriptionPlans.js
```

### 4. Start Server
```bash
# Development mode
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:5000`

## API Endpoints

### Authentication Routes (`/api/auth`)
- `POST /register` - Register new user
- `POST /verify-otp` - Verify email OTP
- `POST /resend-otp` - Resend OTP
- `POST /login` - User login
- `GET /me` - Get current user
- `POST /logout` - Logout user

### Business Routes (`/api/business`)
- `POST /register` - Register business
- `GET /profile` - Get business profile
- `PUT /profile` - Update business profile
- `GET /types` - Get business types
- `DELETE /profile` - Delete business

### Subscription Routes (`/api/subscription`)
- `GET /plans` - Get all plans
- `POST /create-order` - Create payment order
- `POST /verify-payment` - Verify payment
- `GET /status` - Get subscription status
- `GET /history` - Get transaction history
- `POST /cancel` - Cancel subscription
- `POST /webhook` - Razorpay webhook

### User Routes (`/api/user`)
- `GET /profile` - Get complete profile
- `PUT /profile` - Update user profile
- `GET /dashboard` - Get dashboard data
- `DELETE /account` - Delete account

## Authentication Flow

1. **Registration**: User provides basic details
2. **OTP Verification**: Email OTP sent and verified
3. **Business Registration**: Business details collected
4. **Subscription**: Payment via Razorpay
5. **Account Activation**: Full access granted

## Database Models

### User Model
- Basic account information
- Authentication details
- Subscription information
- OTP management

### Business Model
- Business profile details
- Address and contact information
- GST and UPI details
- Operating hours

### Subscription Models
- Subscription plans configuration
- Transaction history
- Payment details

## Security Features

- Password hashing with bcrypt
- JWT token authentication
- Rate limiting (100 requests/15 minutes)
- Input validation and sanitization
- CORS configuration
- Environment variable protection

## Email Templates

Responsive HTML email templates for:
- OTP verification
- Welcome messages
- Subscription confirmations
- Payment notifications

## Error Handling

- Comprehensive error middleware
- Validation error responses
- Development vs production error details
- Structured error messages

## Development

### Project Structure
```
server/
├── models/           # Database models
├── routes/           # API routes
├── middleware/       # Custom middleware
├── utils/           # Utility functions
├── scripts/         # Database scripts
├── server.js        # Main server file
└── package.json     # Dependencies
```

### Testing
Test the API using tools like Postman or curl:

```bash
# Health check
curl http://localhost:5000/api/health

# Register user
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"full_name":"John Doe","email":"john@example.com","mobile_number":"9876543210","password":"Password123"}'
```

## Production Deployment

1. Set `NODE_ENV=production`
2. Use PM2 for process management
3. Configure nginx as reverse proxy
4. Set up SSL certificates
5. Monitor with logging services

## Support

For issues and questions:
- Check the API documentation
- Review error messages and logs
- Contact development team

---

**Note**: This backend is designed to work with the Flutter frontend. Ensure both components are properly configured for the complete Invoiz application experience.