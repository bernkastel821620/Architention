package com.example.demo.security;

import org.springframework.stereotype.Service;

@Service
public class PasswordPolicyValidator {
    public boolean validatePassword(String password) {
        return password != null
                && password.length() >= 12
                && containsDigit(password)
                && containsSymbol(password);
    }

    public boolean containsDigit(String password) {
        return password.chars().anyMatch(Character::isDigit);
    }

    public boolean containsSymbol(String password) {
        return password.chars().anyMatch(ch -> "!@#$%^&*".indexOf(ch) >= 0);
    }
}

