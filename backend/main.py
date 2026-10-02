import hashlib
import os
from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import uuid4

import bcrypt
import boto3
import jwt
from boto3.dynamodb.conditions import Attr
from botocore.config import Config
from botocore.exceptions import ClientError
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field

# ---------- config ----------
# Set a long random value in your environment before deploying:
#   export JWT_SECRET="$(python -c 'import secrets; print(secrets.token_hex(32))')"
JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-change-me")
JWT_HOURS = 12
S3_BUCKET = os.getenv("S3_BUCKET", "intern-ssr-s3-bucket").strip() # set this to your bucket
MAX_RESUME_BYTES = 5 * 1024 * 1024  # 5 MB
STATUSES = ["Applied", "Under review", "Shortlisted", "Selected", "Rejected"]

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

dynamodb = boto3.resource("dynamodb", region_name="ap-south-1")
s3= boto3.client(
    "s3",
    region_name="ap-south-1",
    endpoint_url="https://s3.ap-south-1.amazonaws.com",
    config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
)
internship_table = dynamodb.Table("Internships")
application_table = dynamodb.Table("Apllication")
user_table = dynamodb.Table("Users")


# ---------- models ----------
class Internship(BaseModel):
    id: int = 0
    title: str
    company: str
    description: str
    location: str
    skills: list[str]
    stipend: int
    duration: str


class Application(BaseModel):
    id: int = 0
    candidate_name: str
    candidate_email: str
    internship_id: int
    status: str = "Applied"
    resume_key: str = ""


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1)
    email: EmailStr
    password: str = Field(min_length=8)
    role: Literal["candidate", "recruiter"]


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    role: Literal["candidate", "recruiter"]


# ---------- auth helpers ----------
bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def check_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def make_token(user: dict) -> str:
    payload = {
        "sub": user["email"],
        "name": user["name"],
        "role": user["role"],
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict:
    if not creds:
        raise HTTPException(401, "Please sign in to continue")
    try:
        return jwt.decode(creds.credentials, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Your session expired. Please sign in again")


def require_role(role: str):
    def checker(user: dict = Depends(current_user)) -> dict:
        if user["role"] != role:
            raise HTTPException(403, f"Only {role}s can do this")
        return user

    return checker


def resume_prefix(email: str) -> str:
    return f"resumes/{hashlib.sha256(email.encode()).hexdigest()[:16]}/"


def public_user(item: dict) -> dict:
    return {"name": item["name"], "email": item["email"], "role": item["role"]}


# ---------- auth routes ----------
@app.get("/")
def get_message():
    return {"message": "hello welcome to our platform"}


@app.post("/register")
def register_user(data: RegisterRequest):
    email = data.email.lower()
    if "Item" in user_table.get_item(Key={"email": email}):
        raise HTTPException(409, "An account with this email already exists")

    item = {
        "name": data.name,
        "email": email,
        "role": data.role,
        "password_hash": hash_password(data.password),
    }
    user_table.put_item(Item=item)
    user = public_user(item)
    return {"message": "User registered successfully", "user": user, "token": make_token(user)}


@app.post("/login")
def login_user(data: LoginRequest):
    email = data.email.lower()
    item = user_table.get_item(Key={"email": email}).get("Item")

    # Same message for every failure so attackers can't tell which part was wrong
    invalid = HTTPException(401, "Incorrect email, password or role")
    if not item or "password_hash" not in item:
        raise invalid
    if not check_password(data.password, item["password_hash"]) or item["role"] != data.role:
        raise invalid

    user = public_user(item)
    return {"message": "Login successful", "user": user, "token": make_token(user)}


# ---------- internships ----------
@app.post("/internships")
def create_internship(internship: Internship, user: dict = Depends(require_role("recruiter"))):
    internship.id = internship.id or int(uuid4().int % 1000000000)
    internship_table.put_item(Item=internship.model_dump())
    return {"message": "Internship created successfully", "internship": internship}


@app.get("/internships")
def get_internships():
    return internship_table.scan()["Items"]


@app.get("/internships/{id}")
def get_internship(id: int):
    item = internship_table.get_item(Key={"id": id}).get("Item")
    if not item:
        raise HTTPException(404, "Internship not found")
    return item


@app.put("/internships/{id}")
def update_internship(id: int, data: Internship, user: dict = Depends(require_role("recruiter"))):
    if "Item" not in internship_table.get_item(Key={"id": id}):
        raise HTTPException(404, "Internship not found")

    response = internship_table.update_item(
        Key={"id": id},
        UpdateExpression="SET #title = :title, #company = :company, #description = :description, "
        "#location = :location, #skills = :skills, #stipend = :stipend, #duration = :duration",
        ExpressionAttributeNames={
            "#title": "title", "#company": "company", "#description": "description",
            "#location": "location", "#skills": "skills", "#stipend": "stipend", "#duration": "duration",
        },
        ExpressionAttributeValues={
            ":title": data.title, ":company": data.company, ":description": data.description,
            ":location": data.location, ":skills": data.skills, ":stipend": data.stipend,
            ":duration": data.duration,
        },
        ReturnValues="ALL_NEW",
    )
    return {"message": "Internship updated successfully", "internship": response["Attributes"]}


@app.delete("/internships/{id}")
def delete_internship(id: int, user: dict = Depends(require_role("recruiter"))):
    response = internship_table.delete_item(Key={"id": id}, ReturnValues="ALL_OLD")
    if "Attributes" not in response:
        raise HTTPException(404, "Internship not found")
    return {"message": "Internship deleted successfully", "internship": response["Attributes"]}


# ---------- applications ----------
@app.post("/applications")
def apply_for_internship(application: Application, user: dict = Depends(require_role("candidate"))):
    if "Item" not in internship_table.get_item(Key={"id": application.internship_id}):
        raise HTTPException(404, "Internship not found")

    # The resume must be one this candidate uploaded, and must really exist in S3
    if not application.resume_key.startswith(resume_prefix(user["sub"])):
        raise HTTPException(400, "Please upload your resume as a PDF")
    try:
        s3.head_object(Bucket=S3_BUCKET, Key=application.resume_key)
    except ClientError:
        raise HTTPException(400, "Resume upload not found. Please upload it again")

    # Block duplicate applications from the same candidate
    existing = application_table.scan(
        FilterExpression=Attr("candidate_email").eq(user["sub"])
        & Attr("internship_id").eq(application.internship_id)
    )["Items"]
    if existing:
        raise HTTPException(409, "You have already applied to this internship")

    application.id = application.id or int(uuid4().int % 1000000000)
    application.candidate_email = user["sub"]  # always trust the token, not the request body
    application.status = "Applied"
    application_table.put_item(Item=application.model_dump())
    return {"message": "Application submitted successfully", "application": application}


@app.get("/applications")
def get_applications(user: dict = Depends(current_user)):
    # Candidates only ever see their own applications; recruiters see all
    if user["role"] == "candidate":
        return application_table.scan(FilterExpression=Attr("candidate_email").eq(user["sub"]))["Items"]
    return application_table.scan()["Items"]


@app.post("/resume-upload-url")
def resume_upload_url(user: dict = Depends(require_role("candidate"))):
    """Gives the browser a short-lived, PDF-only, size-limited slot to upload straight to S3."""
    key = f"{resume_prefix(user['sub'])}{uuid4().hex}.pdf"
    post = s3.generate_presigned_post(
        Bucket=S3_BUCKET,
        Key=key,
        Fields={"Content-Type": "application/pdf"},
        Conditions=[
            {"Content-Type": "application/pdf"},
            ["content-length-range", 1, MAX_RESUME_BYTES],
        ],
        ExpiresIn=300,
    )
    return {"url": post["url"], "fields": post["fields"], "key": key}


@app.get("/applications/{application_id}/resume")
def get_resume_link(application_id: int, user: dict = Depends(current_user)):
    item = application_table.get_item(Key={"id": application_id}).get("Item")
    if not item:
        raise HTTPException(404, "Application not found")
    if user["role"] == "candidate" and item["candidate_email"] != user["sub"]:
        raise HTTPException(403, "You can only view your own resume")
    if not item.get("resume_key"):
        raise HTTPException(404, "This application has no resume")
    url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": S3_BUCKET, "Key": item["resume_key"], "ResponseContentType": "application/pdf"},
        ExpiresIn=300,
    )
    return {"url": url}


@app.get("/internships/{internship_id}/applications")
def get_internship_applications(internship_id: int, user: dict = Depends(require_role("recruiter"))):
    return application_table.scan(FilterExpression=Attr("internship_id").eq(internship_id))["Items"]


@app.put("/applications/{application_id}/status")
def update_application_status(
    application_id: int, status: str, user: dict = Depends(require_role("recruiter"))
):
    if status not in STATUSES:
        raise HTTPException(400, f"Status must be one of: {', '.join(STATUSES)}")
    if "Item" not in application_table.get_item(Key={"id": application_id}):
        raise HTTPException(404, "Application not found")

    response = application_table.update_item(
        Key={"id": application_id},
        UpdateExpression="SET #status = :status",
        ExpressionAttributeNames={"#status": "status"},
        ExpressionAttributeValues={":status": status},
        ReturnValues="ALL_NEW",
    )
    return {"message": "Application status updated", "application": response["Attributes"]}
