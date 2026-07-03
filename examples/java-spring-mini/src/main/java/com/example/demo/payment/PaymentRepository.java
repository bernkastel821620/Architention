package com.example.demo.payment;

import java.util.List;
import org.springframework.stereotype.Repository;

@Repository
public class PaymentRepository {
    public void savePayment(String username, long amount) {
        // Simulated payment persistence.
    }

    public List<String> findRecentPayments(String username) {
        return List.of(username + ":100", username + ":500");
    }
}

