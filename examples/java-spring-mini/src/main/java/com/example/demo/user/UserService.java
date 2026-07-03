package com.example.demo.user;

import com.example.demo.common.AuditLogger;
import com.example.demo.notification.EmailNotificationService;
import org.springframework.stereotype.Service;

@Service
public class UserService {
    private final UserRepository userRepository;
    private final UserRegistrationValidator registrationValidator;
    private final EmailNotificationService emailNotificationService;
    private final AuditLogger auditLogger;

    public UserService(
            UserRepository userRepository,
            UserRegistrationValidator registrationValidator,
            EmailNotificationService emailNotificationService,
            AuditLogger auditLogger) {
        this.userRepository = userRepository;
        this.registrationValidator = registrationValidator;
        this.emailNotificationService = emailNotificationService;
        this.auditLogger = auditLogger;
    }

    public String registerUser(String username, String email) {
        registrationValidator.validateRegistration(username, email);
        userRepository.save(username, email);
        auditLogger.recordDomainEvent("user registered " + username);
        emailNotificationService.sendWelcomeEmail(email);
        return "registered";
    }
}

