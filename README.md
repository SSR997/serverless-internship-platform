# Serverless Internship Recruitment Platform

A cloud-based internship recruitment platform designed to connect students with internship opportunities through a simple web application.

The project provides a frontend for users to interact with the platform and a FastAPI backend integrated with AWS cloud services for storing application data and files.

---

## 🚀 Project Overview

The **Serverless Internship Recruitment Platform** is designed to simplify the internship application process.

The platform allows users to:

* View internship opportunities
* Submit internship applications
* Store applicant information
* Manage application status
* Upload and store files
* Access application data through backend APIs

The project uses **React + Vite** for the frontend, **FastAPI** for the backend, and **AWS services** for cloud storage and database management.

---

## 🏗️ Architecture

```text
                    ┌─────────────────────┐
                    │      Frontend       │
                    │    React + Vite     │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │    FastAPI Backend  │
                    │       Python        │
                    └──────────┬──────────┘
                               │
                 ┌─────────────┴─────────────┐
                 │                           │
                 ▼                           ▼
        ┌─────────────────┐         ┌─────────────────┐
        │    DynamoDB     │         │       S3        │
        │ Application Data│         │  File Storage   │
        └─────────────────┘         └─────────────────┘
                 ▲                           ▲
                 └─────────────┬─────────────┘
                               │
                         ┌───────────┐
                         │    IAM    │
                         │ Permissions│
                         └───────────┘
```

### AWS Services Used

| Service             | Purpose                                          |
| ------------------- | ------------------------------------------------ |
| **Amazon DynamoDB** | Stores internship application data               |
| **Amazon S3**       | Stores application-related files/objects         |
| **AWS IAM**         | Controls permissions for accessing AWS resources |

> **Note:** API Gateway is not used in the current implementation.

---

## 🛠️ Tech Stack

### Frontend

* React
* Vite
* JavaScript
* HTML/CSS

### Backend

* Python
* FastAPI
* Uvicorn
* Boto3

### Cloud / AWS

* Amazon DynamoDB
* Amazon S3
* AWS IAM

### Development Tools

* Git
* GitHub
* VS Code

---

## 📂 Project Structure

```text
Serverless Internship Platform/
│
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── ...
│
├── backend/
│   ├── main.py
│   ├── models/
│   ├── routes/
│   ├── venv/
│   └── ...
│
├── lambda/
│
├── docs/
│
└── README.md
```

---

# ☁️ AWS Cloud Implementation

## 1. Amazon DynamoDB

Amazon DynamoDB is used as the database for storing internship application information.

The backend communicates with DynamoDB using **Boto3**, the AWS SDK for Python.

### Application Table

The project uses the DynamoDB table:

```text
Apllication
```

The table stores application-related information such as:

* Applicant details
* Internship information
* Application status
* Other application attributes

### Backend → DynamoDB Flow

```text
User
  ↓
React Frontend
  ↓
FastAPI Backend
  ↓
Boto3
  ↓
Amazon DynamoDB
```

---

## 2. Amazon S3

Amazon S3 is used for cloud-based object/file storage.

It provides scalable storage for files associated with the internship platform.

### S3 Flow

```text
User
  ↓
Frontend
  ↓
FastAPI Backend
  ↓
Boto3
  ↓
Amazon S3
```

S3 separates file storage from application/database data, allowing the application data to remain in DynamoDB while files are maintained in object storage.

---

## 3. AWS IAM

AWS IAM is used to control access to AWS resources.

Instead of allowing unrestricted access, IAM permissions are assigned to the AWS identity used by the backend.

The backend requires appropriate permissions to interact with:

* DynamoDB
* S3

This follows the principle of giving an application only the permissions it requires.

---

# 🔄 Application Flow

```text
1. User interacts with the React frontend
                ↓
2. Frontend sends request to FastAPI backend
                ↓
3. FastAPI processes the request
                ↓
4. Boto3 communicates with AWS
                ↓
        ┌───────┴───────┐
        ↓               ↓
    DynamoDB           S3
        ↓               ↓
 Application Data    File Storage
```

---

# 🔐 Security

AWS IAM is used to manage access to cloud resources.

Sensitive credentials should **not** be committed to GitHub.

For local development, AWS credentials should be configured securely using the AWS CLI or environment-based configuration rather than hardcoding access keys inside the source code.

Example:

```text
AWS Access Key
AWS Secret Access Key
```

These values should never be included directly in the repository.

---

# 💻 Running the Project Locally

## Backend

Navigate to the backend directory:

```bash
cd backend
```

Create and activate the virtual environment:

### Windows

```bash
python -m venv venv
venv\Scripts\activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Start the FastAPI server:

```bash
uvicorn main:app --reload
```

The backend will be available at:

```text
http://127.0.0.1:8000
```

FastAPI documentation:

```text
http://127.0.0.1:8000/docs
```

---

## Frontend

Navigate to the frontend directory:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

The Vite development server will provide the local frontend URL in the terminal.

---

# 📸 AWS Screenshots

Screenshots demonstrating the AWS implementation can be added here.

### DynamoDB

Add screenshot of:

* DynamoDB table
* Table items/application data

```text
docs/images/dynamodb.png
```

### S3

Add screenshot of:

* S3 bucket
* Stored objects/files

```text
docs/images/s3.png
```

### IAM

Add screenshot of:

* IAM user/role
* Required permissions

```text
docs/images/iam.png
```

---

# 📌 Key Features

* Internship application management
* REST APIs using FastAPI
* React-based frontend
* Application data storage using DynamoDB
* Cloud file storage using Amazon S3
* AWS access control using IAM
* Application status management
* API documentation through FastAPI Swagger UI

---

# 🎯 Project Objective

The objective of this project is to build a practical internship recruitment platform while demonstrating the integration of a modern web application with AWS cloud services.

The project provides hands-on experience with:

* REST API development
* Cloud databases
* Object storage
* IAM-based access control
* AWS SDK integration
* Frontend-backend communication
* Git and GitHub

---

# 👨‍💻 Author

**S. Siva Sai Ram**

Computer Science Engineering Student

---

## 📄 License

This project is developed for academic and learning purposes.
