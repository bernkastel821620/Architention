package com.example.demo.payment;

import org.springframework.stereotype.Service;

@Service
public class PaymentFraudValidator {
    public boolean validatePayment(String username, long amount) {
        return checkRequired(username)
                && checkAmountPolicy(amount)
                && checkBlockedTerms(username)
                && checkVelocityPolicy(username);
    }

    public boolean checkRequired(String value) {
        return value != null && !value.isBlank();
    }

    public boolean checkAmountPolicy(long amount) {
        return amount > 0 && amount < 10_000;
    }

    public boolean checkBlockedTerms(String value) {
        return value != null && !value.toLowerCase().contains("fraud");
    }

    public boolean checkVelocityPolicy(String username) {
        return username != null && !username.startsWith("rapid");
    }
}

