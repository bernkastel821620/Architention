package com.example.demo.order;

import org.springframework.web.bind.annotation.RestController;

@RestController
public class OrderController {
    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    public String checkout(String username, String token, long amount) {
        return orderService.checkout(username, token, amount);
    }
}

