const fastify = require('fastify')({ logger: true });
const { getPrisma } = require('./utils/prisma');
const { TRUCK_SECTIONS, SECTION_PARTS, DAMAGE_TYPES, SEVERITY_LEVELS } = require('./constants/truckParts');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const util = require('util');
const { pipeline } = require('stream');
const pump = util.promisify(pipeline);
const path = require('path');


const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}


// Multipart: align with v5 docs and set sensible limits
fastify.register(require('@fastify/multipart'), {
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB per file
    files: 10,
    fields: 100
  },
});


try {
  fastify.register(require('@fastify/cors'), {
    origin: true,
    credentials: true
  });
} catch (e) {
  fastify.log.warn('Failed to register @fastify/cors. It might not be installed or an error occurred:', e.message);
}

// Static file serving for public/ (e.g., uploads)
try {
  fastify.register(require('@fastify/static'), {
    root: path.join(__dirname, '..', 'public'),
    prefix: '/',
    decorateReply: false,
  });
} catch (e) {
  fastify.log.warn('Failed to register @fastify/static. It might not be installed:', e.message);
}


fastify.get('/api/health', async () => ({ ok: true }));


function processNHTSAData(nhtsaResults, vin) {
  const dataMap = {};
  (nhtsaResults || []).forEach((item) => {
    if (item.Value && item.Value !== '' && item.Value !== 'Not Applicable') {
      dataMap[item.Variable] = item.Value;
    }
  });
  return {
    vin,
    make: dataMap['Make'] || null,
    model: dataMap['Model'] || null,
    year: dataMap['Model Year'] ? parseInt(dataMap['Model Year']) : null,
    vehicleType: dataMap['Vehicle Type'] || null,
    bodyClass: dataMap['Body Class'] || null,
    driveType: dataMap['Drive Type'] || null,
    engineInfo: dataMap['Engine Model'] || dataMap['Engine Configuration'] || null,
    fuelType: dataMap['Fuel Type - Primary'] || null,
    gvwr: dataMap['Gross Vehicle Weight Rating'] || null,
    weightClass: dataMap['Gross Vehicle Weight Rating Class'] || null,
    manufacturer: dataMap['Manufacturer Name'] || null,
    plant: (dataMap['Plant City'] || '') + (dataMap['Plant State'] ? ', ' + dataMap['Plant State'] : ''),
    series: dataMap['Series'] || null,
    trim: dataMap['Trim'] || null,
    doors: dataMap['Doors'] || null,
    wheels: dataMap['Wheels'] || null,
    entertainmentSystem: dataMap['Entertainment System'] || null,
    abs: dataMap['ABS'] || null,
    airbagLocations: dataMap['Airbag Locations'] || null,
    electronicStabilityControl: dataMap['Electronic Stability Control (ESC)'] || null,
    basePrice: dataMap['Base Price'] || null,
    bedLength: dataMap['Bed Length'] || null,
    cabType: dataMap['Cab Type'] || null,
    allData: dataMap
  };
}




fastify.post('/api/register', {
  schema: {
    body: {
      type: 'object',
      required: ['name', 'email', 'password'],
      properties: {
        name: { type: 'string', minLength: 1 },
        email: { type: 'string', minLength: 3 },
        password: { type: 'string', minLength: 6 }
      }
    }
  }
}, async (request, reply) => {
  const prisma = getPrisma();
  if (!prisma) return reply.status(501).send({ success: false, message: 'Database not available' });

  const { name, email, password } = request.body;
  if (!name || !email || !password) {
    return reply.status(400).send({ success: false, message: 'Name, email, and password are required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        hashedPassword,
        
      },
    });
    reply.send({ success: true, message: 'User registered successfully', user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    if (error.code === 'P2002') {
      return reply.status(409).send({ success: false, message: 'Email already registered' });
    }
    request.log.error(error, 'User registration failed');
    reply.status(500).send({ success: false, message: 'Internal server error' });
  }
});


fastify.post('/api/auth/login', {
  schema: {
    body: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', minLength: 3 },
        password: { type: 'string', minLength: 6 }
      }
    }
  }
}, async (request, reply) => {
  const prisma = getPrisma();
  if (!prisma) return reply.status(501).send({ success: false, message: 'Database not available' });

  const { email, password } = request.body;
  if (!email || !password) {
    return reply.status(400).send({ success: false, message: 'Email and password are required' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return reply.status(401).send({ success: false, message: 'Invalid credentials' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.hashedPassword);
    if (!isPasswordValid) {
      return reply.status(401).send({ success: false, message: 'Invalid credentials' });
    }

    
    reply.send({ success: true, message: 'Login successful', user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    request.log.error(error, 'Login failed');
    reply.status(500).send({ success: false, message: 'Internal server error' });
  }
});


fastify.post('/api/auth/forgot-password', {
  schema: {
    body: {
      type: 'object',
      required: ['email'],
      properties: {
        email: { type: 'string', minLength: 3 }
      }
    }
  }
}, async (request, reply) => {
  const prisma = getPrisma();
  if (!prisma) return reply.status(501).send({ success: false, message: 'Database not available' });

  const { email } = request.body;
  if (!email) {
    return reply.status(400).send({ success: false, message: 'Email is required' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    
      if (!user) {
      return reply.send({ success: true, message: 'If an account with that email exists, a password reset link has been sent.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour from now

    await prisma.passwordResetToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt,
      },
    });

    
    request.log.info(`Password reset token for ${email}: ${token}`);

    reply.send({ success: true, message: 'If an account with that email exists, a password reset link has been sent.' });
  } catch (error) {
    request.log.error(error, 'Forgot password failed');
    reply.status(500).send({ success: false, message: 'Internal server error' });
  }
});


fastify.post('/api/auth/reset-password', {
  schema: {
    body: {
      type: 'object',
      required: ['token', 'newPassword'],
      properties: {
        token: { type: 'string', minLength: 10 },
        newPassword: { type: 'string', minLength: 6 }
      }
    }
  }
}, async (request, reply) => {
  const prisma = getPrisma();
  if (!prisma) return reply.status(501).send({ success: false, message: 'Database not available' });

  const { token, newPassword } = request.body;
  if (!token || !newPassword) {
    return reply.status(400).send({ success: false, message: 'Token and new password are required' });
  }

  try {
    const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } });

    if (!resetToken || resetToken.expiresAt < new Date()) {
      return reply.status(400).send({ success: false, message: 'Invalid or expired token' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { hashedPassword },
      }),
      prisma.passwordResetToken.delete({ where: { token } }),
    ]);

    reply.send({ success: true, message: 'Password has been reset successfully' });
  } catch (error) {
    request.log.error(error, 'Password reset failed');
    reply.status(500).send({ success: false, message: 'Internal server error' });
  }
});


fastify.post('/api/fake', async (request, reply) => {
  const { images } = request.body || {};
  if (!Array.isArray(images)) {
    return reply.status(400).send({ message: 'images must be an array' });
  }
  const analysis = images.map((img) => ({
    image: img,
    result: 'Detected: Object X with 90% confidence'
  }));
  return reply.send({
    message: 'Simulated AI Response',
    imagesAnalyzed: images,
    analysis
  });
});


fastify.get('/api/truck-data/sections', async (_request, reply) => {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const truckSections = await prisma.truckSection.findMany({ include: { vehicleParts: true } });
      const allowedSectionNames = new Set(Object.values(TRUCK_SECTIONS));
      const filtered = truckSections
        .filter((s) => allowedSectionNames.has(s.name))
        .map((s) => {
          const allowedPartsForSection = new Set(SECTION_PARTS[s.name] || []);
          return {
            ...s,
            vehicleParts: s.vehicleParts.filter((p) => allowedPartsForSection.has(p.name))
          };
        });
      return reply.send(filtered);
    } catch (err) {
      _request?.log?.error({ err }, 'DB error loading truck sections; falling back to constants');
    }
  }

  
  const data = Object.values(TRUCK_SECTIONS).map((sectionName) => ({
    id: sectionName,
    name: sectionName,
    vehicleParts: (SECTION_PARTS[sectionName] || []).map((name) => ({ id: name, name }))
  }));
  return reply.send(data);
});


fastify.get('/api/truck-data/damage-types', async (_request, reply) => {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.damageType.findMany();
      return reply.send(rows);
    } catch (err) {
      _request?.log?.error({ err }, 'DB error loading damage types; falling back to constants');
    }
  }
  const items = Object.values(DAMAGE_TYPES).map((name) => ({ id: name, name }));
  return reply.send(items);
});


fastify.get('/api/truck-data/severity-levels', async (_request, reply) => {
  const prisma = getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.severityLevel.findMany();
      return reply.send(rows);
    } catch (err) {
      _request?.log?.error({ err }, 'DB error loading severity levels; falling back to constants');
    }
  }
  const items = Object.values(SEVERITY_LEVELS).map((name) => ({ id: name, name }));
  return reply.send(items);
});


fastify.post('/api/vehicle/vin', async (request, reply) => {
  try {
    const { vin } = request.body || {};
    if (!vin) return reply.status(400).send({ success: false, message: 'VIN is required' });
    if (String(vin).length !== 17) return reply.status(400).send({ success: false, message: 'VIN must be exactly 17 characters' });

    const nhtsaUrl = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${vin}?format=json`;
    const resp = await fetch(nhtsaUrl, { method: 'GET', headers: { 'User-Agent': 'CM-TruckEst-App/1.0' } });
    if (!resp.ok) throw new Error(`NHTSA API error: ${resp.status}`);
    const data = await resp.json();

    const errResult = data.Results?.find((r) => r.Variable === 'Error Code' && r.Value !== '0');
    if (errResult) {
      const msg = data.Results?.find((i) => i.Variable === 'Error Text')?.Value || 'NHTSA error';
      return reply.status(400).send({ success: false, message: msg });
    }
    if (!data.Results || data.Results.length === 0) {
      return reply.status(404).send({ success: false, message: 'No vehicle data found for this VIN' });
    }

    const vehicle = processNHTSAData(data.Results, vin);
    if (!vehicle.make || vehicle.make === 'N/A' || !vehicle.model || vehicle.model === 'N/A') {
      return reply.status(404).send({ success: false, message: 'No valid truck data associated with this VIN.' });
    }

    
    let jobId = null;
    const prisma = getPrisma();
    if (prisma) {
      try {
        const payload = {
          vin: vin,
          type: vehicle.vehicleType,
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          bodyClass: vehicle.bodyClass,
          driveType: vehicle.driveType,
          engineModel: vehicle.engineInfo,
          engineCylinders: vehicle.allData['Engine Number of Cylinders'] ? parseInt(vehicle.allData['Engine Number of Cylinders']) : null,
          engineDisplacementL: vehicle.allData['Displacement (L)'] ? parseFloat(vehicle.allData['Displacement (L)']) : null,
          fuelTypePrimary: vehicle.fuelType,
          brakeSystemType: vehicle.allData['Brake System Type'],
          manufacturerName: vehicle.manufacturer,
          plantCity: vehicle.allData['Plant City'],
          plantState: vehicle.allData['Plant State'],
          plantCountry: vehicle.allData['Plant Country'],
          trim: vehicle.trim,
          series: vehicle.series,
          steeringLocation: vehicle.allData['Steering Location'],
          transmissionStyle: vehicle.allData['Transmission Style'],
          weightClass: vehicle.weightClass,
          gvwr: vehicle.gvwr,
          doors: vehicle.doors,
          wheels: vehicle.wheels,
          entertainmentSystem: vehicle.entertainmentSystem,
          abs: vehicle.abs,
          airbagLocations: vehicle.airbagLocations,
          electronicStabilityControl: vehicle.electronicStabilityControl,
          basePrice: vehicle.basePrice,
          bedLength: vehicle.bedLength,
          cabType: vehicle.cabType,
          notes: `NHTSA lookup: ${new Date().toISOString()}`
        };
        const upserted = await prisma.vehicle.upsert({ where: { vin }, update: payload, create: payload });
        
        const uploadedById = request.headers['x-user-id'] || 'system'; 
        const created = await prisma.jobReport.create({ data: { vin: upserted.vin, uploadedById } });
        jobId = created.id;
      } catch (err) {
        request?.log?.warn({ err }, 'DB upsert failed; continuing without persistence');
      }
    }

    return reply.send({
      success: true,
      message: 'Vehicle data retrieved from NHTSA successfully',
      vehicle,
      source: 'NHTSA',
      timestamp: new Date().toISOString(),
      jobId,
      rawNHTSAData: data.Results
    });
  } catch (err) {
    request.log.error({ err }, 'VIN lookup failed');
    return reply.status(500).send({ success: false, message: err.message || 'Internal server error' });
  }
});


fastify.get('/api/jobs', async (request, reply) => {
  const prisma = getPrisma();
  if (!prisma) return reply.send({ success: true, jobs: [] });
  try {
    const jobs = await prisma.jobReport.findMany({
      include: {
        vehicle: true,
        images: {
          include: {
            truckSection: true,
            vehicleParts: { include: { vehiclePart: true } },
            damageTypes: { include: { damageType: true } },
            severity: true,
          }
        },
        repairEstimates: { orderBy: { createdAt: 'desc' } },
        feedbacks: { where: { feedbackType: 'expert_correction', actualHours: { not: null } }, orderBy: { createdAt: 'desc' } },
        actualRepairs: { orderBy: { confirmedAt: 'desc' } }
      },
      orderBy: { createdAt: 'desc' }
    });
    return reply.send({ success: true, jobs });
  } catch (err) {
    request.log.error({ err }, 'Failed to fetch jobs');
    return reply.status(500).send({ success: false, message: 'Failed to fetch jobs' });
  }
});

// PUT /api/jobs/:jobId (update expert hours/status) — aligns with Next.js API
fastify.put('/api/jobs/:jobId', async (request, reply) => {
  const prisma = getPrisma();
  if (!prisma) return reply.status(501).send({ success: false, message: 'Database not available' });

  const { jobId } = request.params;
  const { expertHours } = request.body || {};

  if (expertHours === undefined) {
    return reply.status(400).send({ success: false, message: 'Expert hours are required' });
  }

  try {
    const updated = await prisma.jobReport.update({
      where: { id: jobId },
      data: {
        expertEstimate: parseFloat(expertHours),
        status: 'COMPLETED',
      },
    });
    return reply.send({ success: true, job: updated });
  } catch (err) {
    request.log.error({ err }, `Failed to update job ${jobId}`);
    return reply.status(500).send({ success: false, message: 'Failed to update job' });
  }
});

fastify.post('/api/jobs', {
  schema: {
    body: {
      type: 'object',
      required: ['vin'],
      properties: {
        vin: { type: 'string', minLength: 5 }
      }
    }
  }
}, async (request, reply) => {
  const prisma = getPrisma();
  const userId = request.headers['x-user-id'];
  if (!prisma) return reply.status(501).send({ message: 'DB not available' });
  if (!userId) return reply.status(401).send({ message: 'Unauthorized' });
  const { vin } = request.body || {};
  if (!vin) return reply.status(400).send({ message: 'vin is required' });
  try {
    const job = await prisma.jobReport.create({ data: { vin, uploadedById: userId } });
    return reply.send(job);
  } catch (err) {
    request.log.error({ err }, 'Failed to create job');
    return reply.status(500).send({ message: 'Failed to create job' });
  }
});


fastify.get('/api/jobs/:jobId', async (request, reply) => {
  const prisma = getPrisma();
  if (!prisma) return reply.status(501).send({ success: false, message: 'Database not available' });

  const { jobId } = request.params;
  try {
    const job = await prisma.jobReport.findUnique({
      where: { id: jobId },
      include: {
        vehicle: true,
        images: {
          include: {
            truckSection: true,
            vehicleParts: { include: { vehiclePart: true } },
            damageTypes: { include: { damageType: true } },
            severity: true,
          }
        },
        repairEstimates: { orderBy: { createdAt: 'desc' } },
        feedbacks: { where: { feedbackType: 'expert_correction', actualHours: { not: null } }, orderBy: { createdAt: 'desc' } },
        actualRepairs: { orderBy: { confirmedAt: 'desc' } }
      },
    });

    if (!job) {
      return reply.status(404).send({ success: false, message: 'Job not found' });
    }
    reply.send({ success: true, job });
  } catch (error) {
    request.log.error(error, `Failed to fetch job ${jobId}`);
    reply.status(500).send({ success: false, message: 'Internal server error' });
  }
});


fastify.delete('/api/jobs/:jobId', async (request, reply) => {
  const prisma = getPrisma();
  if (!prisma) return reply.status(501).send({ success: false, message: 'Database not available' });

  const { jobId } = request.params;
  try {
    
    await prisma.$transaction([
      prisma.imageVehiclePart.deleteMany({ where: { image: { jobId } } }),
      prisma.imageDamageType.deleteMany({ where: { image: { jobId } } }),
      prisma.image.deleteMany({ where: { jobId } }),
      prisma.repairEstimate.deleteMany({ where: { jobId } }),
      prisma.feedback.deleteMany({ where: { jobId } }),
      prisma.actualRepair.deleteMany({ where: { jobId } }),
      prisma.vINMetadata.deleteMany({ where: { jobId } }),
      prisma.jobReport.delete({ where: { id: jobId } }),
    ]);

    reply.send({ success: true, message: 'Job deleted successfully' });
  } catch (error) {
    request.log.error(error, `Failed to delete job ${jobId}`);
    reply.status(500).send({ success: false, message: 'Internal server error' });
  }
});


fastify.post('/api/feedback', {
  schema: {
    body: {
      type: 'object',
      required: ['jobId', 'feedbackType', 'actualHours'],
      properties: {
        jobId: { type: 'string', minLength: 1 },
        feedbackType: { type: 'string', minLength: 1 },
        message: { type: 'string' },
        actualHours: { type: 'number', minimum: 0 },
        rating: { type: 'number' }
      }
    }
  }
}, async (request, reply) => {
  const prisma = getPrisma();
  const userId = request.headers['x-user-id'];
  if (!prisma) return reply.status(501).send({ message: 'DB not available' });
  if (!userId) return reply.status(401).send({ message: 'Unauthorized' });
  const { jobId, feedbackType, message, actualHours, rating } = request.body;
  try {
    const feedback = await prisma.feedback.create({
      data: {
        userId,
        jobId,
        feedbackType,
        message,
        actualHours,
        experienceScoreSnapshot: rating,
      }
    });
    return reply.send({ success: true, feedback });
  } catch (err) {
    request.log.error({ err }, 'Failed to create feedback');
    return reply.status(500).send({ message: 'Failed to create feedback' });
  }
});

// --- /api/vehicles --- (create or upsert vehicle by vin) (already exists)
fastify.post('/api/vehicles', {
  schema: {
    body: {
      type: 'object',
      required: ['vin'],
      properties: {
        vin: { type: 'string', minLength: 5 },
        type: { type: 'string' },
        make: { type: 'string' },
        model: { type: 'string' },
        year: { type: 'integer' },
        weightClass: { type: 'string' },
        owner: { type: 'string' },
        notes: { type: 'string' },
        referenceImagePath: { type: 'string' }
      }
    }
  }
}, async (request, reply) => {
  const prisma = getPrisma();
  const { vin, type, make, model, year, weightClass, owner, notes, referenceImagePath } = request.body || {};
  if (!vin) return reply.status(400).send({ message: 'vin is required' });
  if (!prisma) {
    // Fallback: echo payload when DB is unavailable
    return reply.status(200).send({ vin, type, make, model, year, weightClass, owner, notes, referenceImagePath });
  }
  try {
    const vehicle = await prisma.vehicle.upsert({
      where: { vin },
      update: {},
      create: { vin, type, make, model, year, weightClass, owner, notes, referenceImagePath }
    });
    return reply.send(vehicle);
  } catch (err) {
    request.log.error({ err }, 'Failed to upsert vehicle');
    return reply.status(500).send({ message: 'Failed to save vehicle' });
  }
});

// --- /api/upload --- (New: for image uploads with labels)
// GET /api/upload — parity with Next.js route (simple availability check)
fastify.get('/api/upload', async (_request, reply) => {
  return reply.send({
    success: true,
    message: 'Upload API is accessible',
    methods: ['POST'],
    timestamp: new Date().toISOString(),
  });
});

fastify.post('/api/upload', async (request, reply) => {
  const prisma = getPrisma();
  if (!prisma) return reply.status(501).send({ success: false, message: 'Database not available' });

  const data = await request.file();
  if (!data) {
    return reply.status(400).send({ success: false, message: 'No file uploaded' });
  }

  const { filename, mimetype } = data;
  const { fields } = data; // Access other form fields

  const jobId = fields.jobId?.value;
  const truckSectionId = fields.truckSectionId?.value;
  const vehiclePartIds = JSON.parse(fields.vehiclePartIds?.value || '[]');
  const damageTypeIds = JSON.parse(fields.damageTypeIds?.value || '[]');
  const severityId = fields.severityId?.value;
  const notes = fields.notes?.value;

  if (!jobId || !truckSectionId || vehiclePartIds.length === 0) {
    return reply.status(400).send({ success: false, message: 'Job ID, Truck Section, and Vehicle Parts are required' });
  }

  const fileExtension = path.extname(filename);
  const uniqueFilename = `${jobId}-${Date.now()}-${crypto.randomBytes(5).toString('hex')}${fileExtension}`;
  const filePath = path.join(UPLOAD_DIR, uniqueFilename);
  const imageUrl = `/uploads/${uniqueFilename}`; // URL relative to public folder

  try {
    await pump(data.file, fs.createWriteStream(filePath));

    const image = await prisma.image.create({
      data: {
        jobId,
        imagePath: imageUrl,
        truckSectionId,
        severityId: severityId || null,
        notes: notes || null,
        vehicleParts: {
          create: vehiclePartIds.map(partId => ({
            vehiclePart: { connect: { id: partId } }
          }))
        },
        damageTypes: {
          create: damageTypeIds.map(damageId => ({
            damageType: { connect: { id: damageId } }
          }))
        }
      },
      include: {
        truckSection: true,
        vehicleParts: { include: { vehiclePart: true } },
        damageTypes: { include: { damageType: true } },
        severity: true,
      }
    });

    reply.send({ success: true, message: 'Image uploaded and saved successfully', image });
  } catch (error) {
    request.log.error(error, 'Image upload failed');
    reply.status(500).send({ success: false, message: 'Internal server error' });
  }
});

// --- /api/vehicle-database --- (for training images)
// GET /api/vehicle-database?vin=:vin
fastify.get('/api/vehicle-database', async (request, reply) => {
  const prisma = getPrisma();
  if (!prisma) return reply.status(501).send({ success: false, message: 'Database not available' });

  const { vin } = request.query;
  if (!vin) {
    return reply.status(400).send({ success: false, message: 'VIN is required' });
  }

  try {
    const images = await prisma.vehicleReferenceImage.findMany({
      where: { vehicleVin: vin },
      orderBy: { uploadedAt: 'asc' },
    });
    reply.send({ success: true, images });
  } catch (error) {
    request.log.error(error, `Failed to fetch training images for VIN: ${vin}`);
    reply.status(500).send({ success: false, message: 'Internal server error' });
  }
});

// POST /api/vehicle-database (upload training image)
fastify.post('/api/vehicle-database', async (request, reply) => {
  const prisma = getPrisma();
  if (!prisma) return reply.status(501).send({ success: false, message: 'Database not available' });

  const data = await request.file();
  if (!data) {
    return reply.status(400).send({ success: false, message: 'No file uploaded' });
  }

  const { filename, mimetype } = data;
  const { fields } = data;

  const vin = fields.vin?.value;
  const angle = fields.angle?.value;
  const userId = request.headers['x-user-id'] || 'system'; // Assuming 'system' if no user ID

  if (!vin) {
    return reply.status(400).send({ success: false, message: 'VIN is required' });
  }

  const fileExtension = path.extname(filename);
  const uniqueFilename = `${vin}-${angle || 'misc'}-${Date.now()}-${crypto.randomBytes(5).toString('hex')}${fileExtension}`;
  const filePath = path.join(UPLOAD_DIR, uniqueFilename);
  const imageUrl = `/uploads/${uniqueFilename}`;

  try {
    await pump(data.file, fs.createWriteStream(filePath));

    const trainingImage = await prisma.vehicleReferenceImage.create({
      data: {
        imageUrl,
        angle: angle || null,
        vehicleVin: vin,
      },
    });

    reply.send({ success: true, message: 'Training image uploaded successfully', trainingImage });
  } catch (error) {
    request.log.error(error, 'Training image upload failed');
    reply.status(500).send({ success: false, message: 'Internal server error' });
  }
});

// --- /api/export/training-data --- (parity with Next.js route)
fastify.get('/api/export/training-data', async (request, reply) => {
  const prisma = getPrisma();
  if (!prisma) return reply.status(501).send({ success: false, message: 'Database not available' });

  try {
    const { format = 'json', includeUnlabeled } = request.query || {};
    const includeUnlabeledBool = String(includeUnlabeled).toLowerCase() === 'true';

    const whereCondition = includeUnlabeledBool ? {} : { vehicleParts: { some: {} } };

    const images = await prisma.image.findMany({
      where: whereCondition,
      include: {
        truckSection: true,
        vehicleParts: { include: { vehiclePart: true } },
        damageTypes: { include: { damageType: true } },
        severity: true,
        job: {
          include: {
            vehicle: true,
            user: true,
          }
        }
      },
      orderBy: { uploadedAt: 'desc' }
    });

    const transformed = images.map(img => ({
      imageId: img.id,
      imagePath: img.imagePath,
      uploadedAt: img.uploadedAt,
      labels: {
        vehicleParts: (img.vehicleParts || []).map(vp => vp.vehiclePart?.name || vp.vehiclePartId),
        damageType: (img.damageTypes || []).map(dt => dt.damageType?.name || dt.damageTypeId),
        severity: img.severity?.name || img.severityId || null,
        notes: img.notes || null,
      },
      vehicle: img.job?.vehicle ? {
        vin: img.job.vehicle.vin,
        make: img.job.vehicle.make,
        model: img.job.vehicle.model,
        year: img.job.vehicle.year,
        vehicleType: img.job.vehicle.vehicleType,
        bodyClass: img.job.vehicle.bodyClass,
        weightClass: img.job.vehicle.weightClass,
        gvwr: img.job.vehicle.gvwr,
      } : null,
      jobId: img.jobId,
      jobCreatedAt: img.job?.createdAt || null,
      labeler: img.job?.user ? {
        userId: img.job.user.id,
        name: img.job.user.name,
        experienceLevel: img.job.user.experienceLevel || null,
      } : null,
    }));

    const stats = {
      totalImages: transformed.length,
      labeledImages: transformed.filter(d => Array.isArray(d.labels.vehicleParts) && d.labels.vehicleParts.length > 0).length,
      unlabeledImages: transformed.filter(d => !Array.isArray(d.labels.vehicleParts) || d.labels.vehicleParts.length === 0).length,
      partDistribution: {},
      damageTypeDistribution: {},
      severityDistribution: {},
      vehicleTypeDistribution: {},
    };

    transformed.forEach(d => {
      (d.labels.vehicleParts || []).forEach(p => { stats.partDistribution[p] = (stats.partDistribution[p] || 0) + 1; });
      (Array.isArray(d.labels.damageType) ? d.labels.damageType : (d.labels.damageType ? [d.labels.damageType] : [])).forEach(t => { stats.damageTypeDistribution[t] = (stats.damageTypeDistribution[t] || 0) + 1; });
      if (d.labels.severity) stats.severityDistribution[d.labels.severity] = (stats.severityDistribution[d.labels.severity] || 0) + 1;
      if (d.vehicle?.vehicleType) stats.vehicleTypeDistribution[d.vehicle.vehicleType] = (stats.vehicleTypeDistribution[d.vehicle.vehicleType] || 0) + 1;
    });

    if (String(format).toLowerCase() === 'csv') {
      const headers = [
        'imageId','imagePath','uploadedAt','vehicleParts','damageType','severity','notes','vin','make','model','year','vehicleType','bodyClass','weightClass','gvwr','jobId','jobCreatedAt','labelerExperience'
      ];
      const rows = transformed.map(item => [
        item.imageId,
        item.imagePath,
        item.uploadedAt,
        Array.isArray(item.labels.vehicleParts) ? item.labels.vehicleParts.join('|') : '',
        Array.isArray(item.labels.damageType) ? item.labels.damageType.join('|') : (item.labels.damageType || ''),
        item.labels.severity || '',
        item.labels.notes || '',
        item.vehicle?.vin || '',
        item.vehicle?.make || '',
        item.vehicle?.model || '',
        item.vehicle?.year || '',
        item.vehicle?.vehicleType || '',
        item.vehicle?.bodyClass || '',
        item.vehicle?.weightClass || '',
        item.vehicle?.gvwr || '',
        item.jobId || '',
        item.jobCreatedAt || '',
        item.labeler?.experienceLevel || ''
      ]);
      const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="training-data-${new Date().toISOString().slice(0,10)}.csv"`);
      return reply.send(csv);
    }

    return reply.send({ success: true, metadata: { exportedAt: new Date().toISOString(), format, includeUnlabeled: includeUnlabeledBool, statistics: stats }, data: transformed });
  } catch (err) {
    request.log.error({ err }, 'Failed to export training data');
    return reply.status(500).send({ success: false, message: 'Failed to export training data' });
  }
});

// DELETE /api/vehicle-database?id=:id (delete training image)
fastify.delete('/api/vehicle-database', async (request, reply) => {
  const prisma = getPrisma();
  if (!prisma) return reply.status(501).send({ success: false, message: 'Database not available' });

  const { id } = request.query;
  if (!id) {
    return reply.status(400).send({ success: false, message: 'Image ID is required' });
  }

  try {
    const image = await prisma.vehicleReferenceImage.delete({ where: { id } });
    // Optionally delete the file from disk
    const filePath = path.join(UPLOAD_DIR, path.basename(image.imageUrl));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    reply.send({ success: true, message: 'Training image deleted successfully' });
  } catch (error) {
    request.log.error(error, `Failed to delete training image ${id}`);
    reply.status(500).send({ success: false, message: 'Internal server error' });
  }
});

// --- AI/Feedback ---

// POST /api/ai (legacy ask AI)
fastify.post('/api/ai', async (request, reply) => {
  // Placeholder for AI interaction
  const { jobId, question, vehicleData } = request.body;
  request.log.info(`AI query for Job ID: ${jobId}, Question: ${question}`);

  // Simulate AI response
  const simulatedResponse = {
    estimatedHours: (Math.random() * 10 + 1).toFixed(1),
    answer: `Based on your question "${question}", a simulated AI estimates the repair would take approximately ${ (Math.random() * 10 + 1).toFixed(1)} hours.`,
  };

  reply.send({ success: true, response: simulatedResponse });
});

// POST /api/ai/repair-estimate
fastify.post('/api/ai/repair-estimate', async (request, reply) => {
  const prisma = getPrisma();
  if (!prisma) return reply.status(501).send({ success: false, message: 'Database not available' });

  const { jobId, vehicleData, damageImages } = request.body;
  request.log.info(`AI repair estimate request for Job ID: ${jobId}`);

  // Simulate AI processing time
  await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay

  // Simulate AI response
  const estimatedHours = (Math.random() * 10 + 1).toFixed(1);
  const simulatedResponse = {
    estimatedHours: `${estimatedHours} hours`,
    answer: `A simulated AI estimates the repair for VIN ${vehicleData?.vin} with ${damageImages?.length || 0} images would take approximately ${estimatedHours} hours.`,
    isFallback: false,
    vehicleInfo: vehicleData,
    damageCount: damageImages?.length || 0
  };

  try {
    // Save estimate to DB
    await prisma.repairEstimate.create({
      data: {
        jobId,
        timeEstimate: parseFloat(estimatedHours),
        costEstimate: parseFloat((estimatedHours * 75).toFixed(2)), // Example cost
      }
    });
    reply.send({ success: true, response: simulatedResponse });
  } catch (error) {
    request.log.error(error, 'Failed to save AI repair estimate');
    reply.status(500).send({ success: false, message: 'Internal server error' });
  }
});

// POST /api/estimates — aligns with Next.js route for saving expert-corrected hours
fastify.post('/api/estimates', async (request, reply) => {
  const prisma = getPrisma();
  if (!prisma) return reply.status(501).send({ success: false, message: 'Database not available' });

  try {
    const { jobId, aiEstimate, correctedHours } = request.body || {};

    if (!jobId || correctedHours === undefined) {
      return reply.status(400).send({ success: false, message: 'Missing required fields: jobId, correctedHours' });
    }

    const corrected = parseFloat(correctedHours);
    if (Number.isNaN(corrected) || corrected < 0) {
      return reply.status(400).send({ success: false, message: 'Corrected hours must be a positive number' });
    }

    // Upsert estimate for the job
    const existing = await prisma.repairEstimate.findFirst({ where: { jobId } });
    let estimate;
    if (existing) {
      estimate = await prisma.repairEstimate.update({
        where: { id: existing.id },
        data: { timeEstimate: corrected, costEstimate: 0 }
      });
    } else {
      estimate = await prisma.repairEstimate.create({
        data: { jobId, timeEstimate: corrected, costEstimate: 0 }
      });
    }

    return reply.send({
      success: true,
      message: 'Expert correction saved successfully',
      correction: {
        id: estimate.id,
        aiEstimate: aiEstimate,
        correctedHours: corrected,
        correctedAt: estimate.createdAt
      }
    });
  } catch (err) {
    request.log.error({ err }, 'Failed to save expert correction');
    return reply.status(500).send({ success: false, message: 'Failed to save expert correction' });
  }
});

// POST /api/expert-corrections
fastify.post('/api/expert-corrections', async (request, reply) => {
  const prisma = getPrisma();
  if (!prisma) return reply.status(501).send({ success: false, message: 'Database not available' });

  const { jobId, correctionType, message, actualHours, rating, aiEstimate } = request.body;
  const userId = request.headers['x-user-id'] || 'system'; // Assuming 'system' if no user ID

  if (!jobId || !actualHours) {
    return reply.status(400).send({ success: false, message: 'Job ID and actual hours are required' });
  }

  try {
    await prisma.feedback.create({
      data: {
        userId,
        jobId,
        feedbackType: correctionType,
        message: message || `Expert corrected AI estimate to ${actualHours} hours. AI was ${aiEstimate} hours.`,
        actualHours: parseFloat(actualHours),
        experienceScoreSnapshot: rating,
      }
    });
    reply.send({ success: true, message: 'Expert correction submitted successfully' });
  } catch (error) {
    request.log.error(error, 'Failed to submit expert correction');
    reply.status(500).send({ success: false, message: 'Internal server error' });
  }
});

// --- /api/estimate --- (Placeholder)
fastify.get('/api/estimate', async (request, reply) => {
  // This endpoint's exact purpose is unclear from the frontend.
  // It might be for fetching a specific estimate, or triggering a new one.
  // For now, return a placeholder response.
  reply.send({ success: true, message: 'Estimate endpoint placeholder', data: {} });
});


// Start server if this file is run directly
if (require.main === module) {
  const port = process.env.PORT || 4000;
  fastify.listen({ port, host: '0.0.0.0' })
    .then(() => fastify.log.info(`Fastify API running on :${port}`))
    .catch((err) => {
      fastify.log.error(err);
      process.exit(1);
    });
}

module.exports = fastify;
