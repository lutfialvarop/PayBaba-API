import Joi from "joi";

export const registerSchema = Joi.object({
    email: Joi.string().email().required().messages({
        "string.email": "Email harus valid",
        "any.required": "Email wajib diisi",
    }),
    password: Joi.string().min(8).required().messages({
        "string.min": "Password minimal 8 karakter",
        "any.required": "Password wajib diisi",
    }),
    companyName: Joi.string().required().messages({
        "any.required": "Nama perusahaan wajib diisi",
    }),
    fullName: Joi.string().required().messages({
        "any.required": "Nama lengkap wajib diisi",
    }),
    city: Joi.string().required().messages({
        "any.required": "Kota wajib diisi",
    }),
    address: Joi.string().required().messages({
        "any.required": "Alamat wajib diisi",
    }),
    phoneNumber: Joi.string()
        .pattern(/^(\+62|0)[0-9]{9,12}$/)
        .required()
        .messages({
            "string.pattern.base": "Nomor telepon harus valid (Indonesia)",
            "any.required": "Nomor telepon wajib diisi",
        }),
});

export const loginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
});

export const resetPasswordSchema = Joi.object({
    email: Joi.string().email().required(),
});

export const setNewPasswordSchema = Joi.object({
    newPassword: Joi.string().min(8).required(),
    confirmPassword: Joi.string().valid(Joi.ref("newPassword")).required().messages({
        "any.only": "Password tidak cocok",
    }),
});

export const createTransactionSchema = Joi.object({
    type: Joi.string().valid("QRIS", "CASH").required().messages({
        "any.only": "Tipe transaksi hanya QRIS atau CASH",
    }),
    amount: Joi.number().positive().required(),
    description: Joi.string().max(200),
    productName: Joi.string().required(),
    productInfo: Joi.array().items(
        Joi.object({
            id: Joi.string().required(),
            name: Joi.string().required(),
            price: Joi.number().positive().required(),
            quantity: Joi.number().positive().integer().required(),
            type: Joi.string(),
        }),
    ),
});

export const validateRequest = (schema) => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.body, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            const messages = error.details.map((detail) => ({
                field: detail.path.join("."),
                message: detail.message,
            }));
            return res.status(400).json({
                success: false,
                message: "Validasi gagal",
                errors: messages,
            });
        }

        req.validatedData = value;
        next();
    };
};
