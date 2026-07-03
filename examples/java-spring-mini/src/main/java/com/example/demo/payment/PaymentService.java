package com.example.demo.payment;

import com.example.demo.common.AuditLogger;
import com.example.demo.notification.EmailNotificationService;
import com.example.demo.security.AuthenticationService;
import com.example.demo.user.UserRepository;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

@Service
public class PaymentService {
    private final PaymentRepository paymentRepository;
    private final PaymentFraudValidator fraudValidator;
    private final UserRepository userRepository;
    private final AuthenticationService authenticationService;
    private final EmailNotificationService emailNotificationService;
    private final AuditLogger auditLogger;

    public PaymentService(
            PaymentRepository paymentRepository,
            PaymentFraudValidator fraudValidator,
            UserRepository userRepository,
            AuthenticationService authenticationService,
            EmailNotificationService emailNotificationService,
            AuditLogger auditLogger) {
        this.paymentRepository = paymentRepository;
        this.fraudValidator = fraudValidator;
        this.userRepository = userRepository;
        this.authenticationService = authenticationService;
        this.emailNotificationService = emailNotificationService;
        this.auditLogger = auditLogger;
    }

    @PreAuthorize("hasRole('USER')")
    public String charge(String username, String token, long amount) {
        if (!authenticationService.hasActiveSession(token) || !userRepository.existsByUsername(username)) {
            return "denied";
        }
        fraudValidator.validatePayment(username, amount);
        paymentRepository.savePayment(username, amount);
        auditLogger.recordDomainEvent("payment charged " + amount);
        emailNotificationService.sendPaymentReceipt(username, amount);
        return "charged";
    }
}

