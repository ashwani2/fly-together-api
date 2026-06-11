# Fly Together API Contract

Base URL: `http://localhost:4000/api`

**Envelopes**
- Success: `{ "data": ... }`
- Error: `{ "error": { "code": string, "message": string, "details"?: any } }`

**Auth**: send `Authorization: Bearer <accessToken>` on protected routes.
Roles: `STUDENT`, `ADMIN`, `AGENT`.

**Seeded demo logins** (all password `Password1!`):
- `admin@flytogether.com` (ADMIN)
- `agent@flytogether.com` (AGENT)
- `alex.j@example.com` (STUDENT)

---

## Auth — `/auth`
| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| POST | `/auth/register` | public | `{ email, password(min8), role: "STUDENT"\|"AGENT", consent: true, name? }` | `{ user, accessToken, refreshToken }` |
| POST | `/auth/login` | public | `{ email, password }` | `{ user, accessToken, refreshToken }` |
| POST | `/auth/refresh` | public | `{ refreshToken }` | `{ accessToken, refreshToken }` |
| POST | `/auth/logout` | public | — | `{ success: true }` |
| GET | `/auth/me` | any | — | `{ id, email, role, phoneNumber }` |

## Students — `/students`
| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| GET | `/students/me` | STUDENT | — | Student profile |
| PUT | `/students/me` | STUDENT | `{ firstName?, lastName?, dob?, address?, phoneNumber? }` | Updated profile (recomputes `profileCompletion`) |

## Documents — `/students/me/documents` & `/documents`
| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| POST | `/students/me/documents` | STUDENT | multipart: `file` (pdf/jpg/png ≤10MB), `docType: PASSPORT\|AADHAR\|ACADEMICS\|IELTS` | Created document |
| GET | `/students/me/documents` | STUDENT | — | Document list (non-removed) |
| DELETE | `/documents/:id` | STUDENT | — | Soft-deleted document |
| PATCH | `/documents/:id/verify` | ADMIN/AGENT | `{ status: UPLOADED\|PENDING\|VERIFIED\|REJECTED }` | Updated document |
| GET | `/files/:key?expires=&sig=` | signed (public) | — | File bytes |

## Agents — `/agents`
| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/agents` | ADMIN | Agents with `numberOfStudents` |
| GET | `/agents/me/students` | AGENT | Assigned students |
| PATCH | `/agents/students/:id/verify` | AGENT/ADMIN | Student with `isProfileVerified: true` |

## Universities — `/universities`
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/universities` | public | Each item includes `courses: string[]` |
| GET | `/universities/:id` | public | |
| POST/PUT/DELETE | `/universities[/:id]` | ADMIN | Body: `{ name, location, logo, rating, tuitionFee, description, courses: string[] }` |

## Accommodations — `/accommodations`
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/accommodations?city=&type=` | public | Filter by city (contains) / type |
| GET | `/accommodations/:id` | public | |
| POST/PUT/DELETE | `/accommodations[/:id]` | ADMIN | Body: `{ name, city, universityProximity?, price, type, amenities: string[], image, description }` |

## Service Providers — `/service-providers`
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/service-providers?category=` | public | Category: `ACCOMMODATION\|TICKET_BOOKING\|LOANS\|LOGISTICS\|ONLINE_PAYMENT` |
| GET | `/service-providers/:id` | public | |
| POST/PUT/DELETE | `/service-providers[/:id]` | ADMIN | Body: `{ name, category, rating, price, location?, image, description }` |

## Partners — `/partners`
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/partners` / `/partners/:id` | public | |
| POST/PUT/DELETE | `/partners[/:id]` | ADMIN | Body: `{ name, imageUrl, redirectionUrl }` |

## Blogs — `/blogs`
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/blogs` | public | |
| GET | `/blogs/slug/:slug` | public | Fetch by slug |
| GET | `/blogs/:id` | public | |
| POST/PUT/DELETE | `/blogs[/:id]` | ADMIN | Body: `{ title, slug, excerpt, content, coverImage, author, category, readTime, isActive?, videoUrl?, publishedBy? }`. Duplicate slug → 409 |

## Testimonials — `/testimonials`
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/testimonials` / `/testimonials/:id` | public | |
| POST/PUT/DELETE | `/testimonials[/:id]` | ADMIN | Body: `{ studentName, universityName?, content, mediaUrl, mediaType: IMAGE\|VIDEO, avatarUrl?, isActive? }` |

## Loans — `/loans`
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/loans` | STUDENT | Body: `{ amount, details? }` |
| GET | `/loans` | any | STUDENT sees own; ADMIN sees all |
| PATCH | `/loans/:id` | ADMIN | Body: `{ status }` |

## Applications — `/applications`
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/applications` | STUDENT | Body: `{ universityId, course }`. Creates a `CREATED` timeline entry |
| GET | `/applications` | any | STUDENT sees own; ADMIN/AGENT see all |
| GET | `/applications/:id` | any | |
| GET | `/applications/:id/timeline` | any | |
| PATCH | `/applications/:id/status` | ADMIN/AGENT | Body: `{ status, rejectionReason? }` (status enum as `ApplicationStatus`) |
| PATCH | `/applications/:id/payment` | ADMIN | Body: `{ paymentLink?, paymentStatus: PENDING\|COMPLETED\|FAILED }` (manual in v1) |

## Admin / Audit / Consent
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/admin/stats` | ADMIN | `{ students, agents, applications, documents, universities }` |
| GET | `/audit` | ADMIN | Last 200 audit log entries |
| POST | `/consent` | any | Body: `{ consentType, granted? }` |
| GET | `/consent/me` | any | Caller's consents |
| GET | `/health` | public | `{ status: "ok" }` |
