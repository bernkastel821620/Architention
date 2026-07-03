package com.example.demo.order;

import com.example.demo.common.AuditLogger;
import com.example.demo.payment.PaymentService;
import com.example.demo.user.UserRepository;
import org.springframework.stereotype.Service;

@Service
public class OrderService {
    private final PaymentService paymentService;
    private final UserRepository userRepository;
    private final AuditLogger auditLogger;

    public OrderService(PaymentService paymentService, UserRepository userRepository, AuditLogger auditLogger) {
        this.paymentService = paymentService;
        this.userRepository = userRepository;
        this.auditLogger = auditLogger;
    }

    public String checkout(String username, String token, long amount) {
        if (!userRepository.existsByUsername(username)) {
            return "unknown user";
        }
        auditLogger.recordDomainEvent("checkout started for " + username);
        return paymentService.charge(username, token, amount);
    }
}

