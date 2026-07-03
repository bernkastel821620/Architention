package com.example.demo.user;

import org.springframework.stereotype.Service;

@Service
public class UserRegistrationValidator {
    public boolean validateRegistration(String username, String email) {
        return checkRequired(username)
                && checkEmailShape(email)
                && checkBlockedTerms(username)
                && checkLengthPolicy(username);
    }

    public boolean checkRequired(String value) {
        return value != null && !value.isBlank();
    }

    public boolean checkEmailShape(String email) {
        return email != null && email.contains("@");
    }

    public boolean checkBlockedTerms(String value) {
        return value != null && !value.toLowerCase().contains("admin");
    }

    public boolean checkLengthPolicy(String value) {
        return value != null && value.length() >= 3;
    }
}

